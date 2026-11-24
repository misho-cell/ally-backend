/**
 * Misho, 21 Nov: a question his goal asked of someone reached their WhatsApp,
 * but their answer, typed without swiping the message, went to a chat of their
 * own; and the goal's news about an answer could reach him in WhatsApp only as
 * the notice he asked never to get. An answer now goes to the question it
 * answers, and the goal's own words reach him under its name.
 */
const mockCreate = jest.fn();
const mockQuery = jest.fn();
const mockTell = jest.fn();
jest.mock('../../config/anthropic', () => ({
  __esModule: true,
  default: { messages: { create: (...a: unknown[]) => mockCreate(...a) } },
}));
jest.mock('../../db/postgres/client', () => ({
  __esModule: true,
  query: (...a: unknown[]) => mockQuery(...a),
}));
jest.mock('../costLedger.service', () => ({ recordClaudeUsage: async () => undefined }));
jest.mock('../taskStore.service', () => ({ getOpenTaskByThread: async () => null }));
jest.mock('../threads.service', () => ({ createThread: async () => ({ id: 1 }) }));
jest.mock('../whatsappChannel.service', () => ({
  asReplyButtons: () => null,
  replyInWhatsapp: async () => undefined,
  tellInWhatsapp: (...a: unknown[]) => mockTell(...a),
}));

import { readFileSync } from 'fs';
import { join } from 'path';
import { answersFrom, questionThreadForLine } from '../whatsappRouting.service';
import {
  oweWhatsappReply,
  sendGoalNewsToWhatsapp,
  whatsappReplyOwed,
} from '../whatsappReplies.service';

const ASK_THREAD = 84000;
const said = (word: string): unknown => ({
  content: [{ type: 'text', text: word }],
  usage: { input_tokens: 10, output_tokens: 1 },
});

beforeEach(() => {
  mockCreate.mockReset();
  mockQuery.mockReset();
  mockTell.mockReset().mockResolvedValue('sent');
  jest.spyOn(console, 'info').mockImplementation(() => {});
});

describe('a WhatsApp answer reaches the one who asked', () => {
  it('takes the small model’s word', () => {
    expect(answersFrom('answers')).toBe(true);
    expect(answersFrom(' Answers.')).toBe(true);
    expect(answersFrom('other')).toBe(false);
  });

  it('sends an unswiped answer to the question that waits for it', async () => {
    mockQuery.mockResolvedValue({
      rows: [{ thread_id: ASK_THREAD, question: 'ხომ არ იცნობ სანდო ხელოსანს?' }],
    });
    mockCreate.mockResolvedValue(said('answers'));
    await expect(questionThreadForLine(5, 'კი, ლევან ჯაფარიძე კარგი ხელოსანია')).resolves.toBe(
      ASK_THREAD,
    );
    const sql = String(mockQuery.mock.calls[0][0]);
    expect(sql).toContain("a.status = 'sent'");
    expect(sql).toContain("ir.status = 'pending'");
    expect(mockQuery.mock.calls[0][1]).toEqual([5, 24]);
    expect(typeof mockQuery.mock.calls[0][2]).toBe('number');
  });

  it('leaves a line that is about something else, or when nothing waits', async () => {
    mockQuery.mockResolvedValue({ rows: [{ thread_id: ASK_THREAD, question: 'ხელოსანი?' }] });
    mockCreate.mockResolvedValue(said('other'));
    await expect(questionThreadForLine(5, 'ბუღალტერი მჭირდება')).resolves.toBeNull();
    mockQuery.mockResolvedValue({ rows: [] });
    await expect(questionThreadForLine(5, 'კი')).resolves.toBeNull();
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });

  it('leaves the line where it was when the read fails', async () => {
    mockQuery.mockRejectedValue(new Error('timeout'));
    jest.spyOn(console, 'error').mockImplementation(() => {});
    await expect(questionThreadForLine(5, 'კი')).resolves.toBeNull();
  });

  it('is tried before a new request is looked for, and never for a swiped reply', () => {
    const inbound = readFileSync(join(__dirname, '..', 'whatsappInbound.service.ts'), 'utf8');
    expect(inbound).toContain(
      'const answered = routed ? await questionThreadForLine(userId, text) : null;',
    );
    expect(inbound).toContain('message.replyTo === null && text === typed');
  });
});

describe('news on a goal reaches WhatsApp as the goal’s own words', () => {
  it('sends the reply under the goal’s name, worth a template', async () => {
    await sendGoalNewsToWhatsapp(7, 900, 'ნინომ უპასუხა: ლევანს იცნობს.', 'ხელოსანი');
    expect(mockTell).toHaveBeenCalledWith(7, 'ხელოსანი\nნინომ უპასუხა: ლევანს იცნობს.', 900, true);
  });

  it('sends nothing for an empty reply', async () => {
    await sendGoalNewsToWhatsapp(7, 900, '  ', 'ხელოსანი');
    expect(mockTell).not.toHaveBeenCalled();
  });

  it('knows when the answer is already owed to WhatsApp, so it is not sent twice', () => {
    oweWhatsappReply(8, 901, '12025550113', 1_000);
    expect(whatsappReplyOwed(8, 901, 2_000)).toBe(true);
    expect(whatsappReplyOwed(8, 902, 2_000)).toBe(false);
    const engine = readFileSync(join(__dirname, '..', 'taskEngine.service.ts'), 'utf8');
    expect(engine).toContain('if (!answerOwedInWhatsapp) {');
    expect(engine).not.toContain('„დავალებაზე სიახლეა"');
  });
});
