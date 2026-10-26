const mockCreate = jest.fn();
const mockGetCard = jest.fn();
const mockUpdate = jest.fn();
jest.mock('../../config/anthropic', () => ({
  __esModule: true,
  default: { messages: { create: (...a: unknown[]) => mockCreate(...a) } },
}));
jest.mock('../costLedger.service', () => ({
  __esModule: true,
  recordClaudeUsage: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../threads.service', () => ({
  __esModule: true,
  userLanguage: jest.fn().mockResolvedValue('ka'),
}));
jest.mock('../warRoomCards.service', () => ({
  __esModule: true,
  getWarRoomCard: (...a: unknown[]) => mockGetCard(...a),
  updateWarRoomCard: (...a: unknown[]) => mockUpdate(...a),
  withoutNumbers: (text: string) => text.replace(/\+?\d[\d\s-]{6,}\d/gu, '…'),
}));

import { readFileSync } from 'fs';
import { join } from 'path';
import { DRAFTED_BY, DraftOutcome, writeCardDraft } from '../warRoomDraft.service';

const card = {
  id: 9,
  user_id: 191012,
  instruction: 'უთხარი, რომ ხვალ ისევ ვცდით',
  sent_by: null,
  brief: { who: 'Merab', their_words: 'ვერ მიპოვე', netai_did: 'asked 2', stalled: 'quiet 30h' },
};

beforeEach(() => jest.clearAllMocks());

/** #7591 step 5: the founder leaves an instruction; a worker writes the draft. */
describe('a war-room card gets a draft', () => {
  it('writes the draft from the instruction, without numbers, and stores it as the worker’s', async () => {
    mockGetCard.mockResolvedValueOnce(card);
    mockCreate.mockResolvedValueOnce({
      content: [{ type: 'text', text: 'მერაბ, ხვალ ისევ ვცდი. +995 599 123 456' }],
      usage: {},
    });
    mockUpdate.mockResolvedValueOnce({ ...card, draft: 'x' });
    const { outcome } = await writeCardDraft(9);
    expect(outcome).toBe(DraftOutcome.Drafted);
    const [, change] = mockUpdate.mock.calls[0] as [number, { draft: string; by: string }];
    expect(change.by).toBe(DRAFTED_BY);
    expect(change.draft).not.toMatch(/599/u);
    const [request] = mockCreate.mock.calls[0] as [{ messages: { content: string }[] }];
    expect(request.messages[0]?.content).toContain(card.instruction);
  });

  it('writes nothing without an instruction, or on a card already sent', async () => {
    mockGetCard.mockResolvedValueOnce({ ...card, instruction: null });
    expect((await writeCardDraft(9)).outcome).toBe(DraftOutcome.NoInstruction);
    mockGetCard.mockResolvedValueOnce({ ...card, sent_by: '1' });
    expect((await writeCardDraft(9)).outcome).toBe(DraftOutcome.AlreadySent);
    mockGetCard.mockResolvedValueOnce(null);
    expect((await writeCardDraft(9)).outcome).toBe(DraftOutcome.NoSuchCard);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('starts when an instruction is left, and has its own route; it never sends', () => {
    const routes = readFileSync(
      join(__dirname, '..', '..', 'api', 'routes', 'admin.routes.ts'),
      'utf8',
    );
    expect(routes).toContain("'/war-room/cards/:id/draft'");
    expect(routes).toContain(
      'if (instruction !== undefined && draft === undefined) draftInTheBackground(card.id);',
    );
    const worker = readFileSync(join(__dirname, '..', 'warRoomDraft.service.ts'), 'utf8');
    expect(worker).not.toContain('sendNetaiMessage');
  });
});
