jest.mock('../../db/postgres/client', () => ({ __esModule: true, query: jest.fn(), default: {} }));

import { readFileSync } from 'fs';
import { join } from 'path';
import { query } from '../../db/postgres/client';
import { NOT_ON_NETAI_LINE, saysItCannotSendNow, threadAskedSomebody } from '../instructionUnsent';

const mockQuery = query as jest.MockedFunction<typeof query>;

beforeEach(() => {
  mockQuery.mockReset();
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});

/** #6361 (Giorgi, G-169): a follow-up to a go-between was refused without being tried. */
describe('a reply that says the follow-up cannot go now', () => {
  it.each([
    'ლიკას ასისტენტთან ამ დაზუსტებას ახლა ვერ ვაგზავნი.',
    'ახლა აქედან ლიკას ასისტენტთან შეტყობინებას ვერ ვაგზავნი. ეს ჩემი შეზღუდვაა.',
    'I can’t send that to her right now.',
  ])('is caught: %s', (reply) => {
    expect(saysItCannotSendNow(reply)).toBe(true);
  });

  it.each([
    'ლიკას ასისტენტს კითხვა გავუგზავნე.',
    NOT_ON_NETAI_LINE.ka('ვახო'),
    'Lika Osepashvili: ნახა, პასუხს ველოდები',
  ])('leaves a reply that sent, or could not by a real reason: %s', (reply) => {
    expect(saysItCannotSendNow(reply)).toBe(false);
  });
});

describe('a case that already asked somebody', () => {
  it('is read from the conversation’s goals', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ asked: true }], rowCount: 1 } as never);
    await expect(threadAskedSomebody(62635)).resolves.toBe(true);
    expect(mockQuery.mock.calls[0][1]).toEqual([62635]);
  });

  it('accuses nobody when the read fails', async () => {
    mockQuery.mockRejectedValueOnce(new Error('timeout'));
    await expect(threadAskedSomebody(62635)).resolves.toBe(false);
  });

  it('gets the run one more turn only when no send was even tried', () => {
    const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
    expect(chat).toContain("!toolNamesUsed.includes('ask_contact') &&");
    expect(chat).toContain('saysItCannotSendNow(finalText) &&');
    expect(chat).toContain('(await threadAskedSomebody(threadId))');
  });
});
