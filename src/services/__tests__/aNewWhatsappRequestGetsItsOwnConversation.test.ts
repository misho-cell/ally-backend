/**
 * Misho, 21 Nov: in his one WhatsApp chat a new request landed in a conversation
 * holding an October goal, so the new goal was refused, the full research never
 * started and only the quick answer came — and even a second answer could not
 * have reached WhatsApp, which was owed one reply per line.
 */
const mockCreate = jest.fn();
const mockOpenGoal = jest.fn();
const mockCreateThread = jest.fn();
const mockReplyInWhatsapp = jest.fn();
const mockQuery = jest.fn();
jest.mock('../../db/postgres/client', () => ({
  __esModule: true,
  query: (...a: unknown[]) => mockQuery(...a),
}));
jest.mock('../../config/anthropic', () => ({
  __esModule: true,
  default: { messages: { create: (...a: unknown[]) => mockCreate(...a) } },
}));
jest.mock('../costLedger.service', () => ({ recordClaudeUsage: async () => undefined }));
jest.mock('../taskStore.service', () => ({
  getOpenTaskByThread: (...a: unknown[]) => mockOpenGoal(...a),
}));
jest.mock('../threads.service', () => ({
  createThread: (...a: unknown[]) => mockCreateThread(...a),
}));
jest.mock('../whatsappChannel.service', () => ({
  asReplyButtons: () => null,
  replyInWhatsapp: (...a: unknown[]) => mockReplyInWhatsapp(...a),
}));

import { readFileSync } from 'fs';
import { join } from 'path';
import { LineKind, conversationForLine, lineKindFrom } from '../whatsappRouting.service';
import {
  deliverOwedWhatsappReply,
  labelWhatsappThread,
  labelled,
  oweSecondWhatsappReply,
  oweWhatsappReply,
} from '../whatsappReplies.service';

const OLD_THREAD = 52000;
const NEW_THREAD = 99000;
const PHONE = '12025550113';
const said = (word: string): unknown => ({
  content: [{ type: 'text', text: word }],
  usage: { input_tokens: 10, output_tokens: 1 },
});

beforeEach(() => {
  mockCreate.mockReset();
  mockOpenGoal.mockReset();
  mockCreateThread.mockReset().mockResolvedValue({ id: NEW_THREAD });
  mockReplyInWhatsapp.mockReset().mockResolvedValue(undefined);
  mockQuery.mockReset().mockResolvedValue({ rows: [] });
  jest.spyOn(console, 'info').mockImplementation(() => {});
});

describe('a new WhatsApp request gets its own conversation', () => {
  it('reads the small model’s word, and stays put on anything else', () => {
    expect(lineKindFrom(' new_request\n')).toBe(LineKind.NewRequest);
    expect(lineKindFrom('talk')).toBe(LineKind.Talk);
    expect(lineKindFrom('same_goal')).toBe(LineKind.SameGoal);
    expect(lineKindFrom('')).toBe(LineKind.SameGoal);
  });

  it('opens a new conversation for a new request beside an open goal', async () => {
    mockOpenGoal.mockResolvedValue({ id: 1, title: 'ბუღალტერი' });
    mockCreate.mockResolvedValue(said('new_request'));
    await expect(
      conversationForLine(7, OLD_THREAD, 'ფეხბურთის მწვრთნელი მჭირდება დიდუბეში'),
    ).resolves.toBe(NEW_THREAD);
    expect(mockCreateThread).toHaveBeenCalledWith('7', 'regular');
    expect(mockCreate.mock.calls[0][0].messages[0].content).toContain('ბუღალტერი');
  });

  it('keeps a line that goes on with the goal, or just talk, where it was', async () => {
    mockOpenGoal.mockResolvedValue({ id: 1, title: 'ბუღალტერი' });
    mockCreate.mockResolvedValue(said('same_goal'));
    await expect(conversationForLine(7, OLD_THREAD, 'ნინოსაც ჰკითხე')).resolves.toBe(OLD_THREAD);
    mockCreate.mockResolvedValue(said('talk'));
    await expect(conversationForLine(7, OLD_THREAD, 'მადლობა')).resolves.toBe(OLD_THREAD);
    expect(mockCreateThread).not.toHaveBeenCalled();
  });

  it('asks nothing when the conversation holds no goal, and stays put on a failure', async () => {
    mockOpenGoal.mockResolvedValue(null);
    await expect(conversationForLine(7, OLD_THREAD, 'გამარჯობა')).resolves.toBe(OLD_THREAD);
    expect(mockCreate).not.toHaveBeenCalled();
    mockOpenGoal.mockResolvedValue({ id: 1, title: 'ბუღალტერი' });
    mockCreate.mockRejectedValue(new Error('timeout'));
    jest.spyOn(console, 'error').mockImplementation(() => {});
    await expect(conversationForLine(7, OLD_THREAD, 'რამე')).resolves.toBe(OLD_THREAD);
  });

  it('sends the second answer to WhatsApp, under the goal’s name', async () => {
    oweWhatsappReply(8, NEW_THREAD, PHONE, 1_000);
    labelWhatsappThread(NEW_THREAD, 'ფეხბურთის მწვრთნელი');
    await deliverOwedWhatsappReply(8, NEW_THREAD, 'სწრაფი პასუხი', [], 2_000);
    expect(oweSecondWhatsappReply(8, NEW_THREAD, 3_000)).toBe(true);
    await deliverOwedWhatsappReply(8, NEW_THREAD, 'სრული პასუხი', [], 4_000);
    expect(mockReplyInWhatsapp).toHaveBeenCalledTimes(2);
    expect(mockReplyInWhatsapp.mock.calls[1][2]).toBe('ფეხბურთის მწვრთნელი\nსრული პასუხი');
  });

  it('owes no second answer to a conversation not asked from WhatsApp, or asked long ago', () => {
    expect(oweSecondWhatsappReply(9, NEW_THREAD, 0)).toBe(false);
    oweWhatsappReply(10, NEW_THREAD, PHONE, 0);
    expect(oweSecondWhatsappReply(10, NEW_THREAD, 3 * 60 * 60_000)).toBe(false);
  });

  it('labels nothing without a goal name', () => {
    expect(labelled('პასუხი', undefined)).toBe('პასუხი');
  });

  it('routes only an unquoted line that is not a picked choice', () => {
    const inbound = readFileSync(join(__dirname, '..', 'whatsappInbound.service.ts'), 'utf8');
    expect(inbound).toContain('message.replyTo === null && text === typed');
  });
});
