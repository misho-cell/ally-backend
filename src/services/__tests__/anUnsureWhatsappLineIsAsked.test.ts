/**
 * Misho, 24 Nov: „when a new request comes in and it is not sure whether it is
 * the old task or a new one, let it ask the user." The router may now say it
 * is unsure; the person is asked, and the line waits for their answer.
 */
const mockCreate = jest.fn();
const mockOpenGoal = jest.fn();
const mockCreateThread = jest.fn();
const mockReply = jest.fn();
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
jest.mock('../whatsappReplies.service', () => ({ labelWhatsappThread: () => undefined }));
jest.mock('../whatsappChannel.service', () => ({
  replyInWhatsapp: (...a: unknown[]) => mockReply(...a),
}));
jest.mock('../../db/postgres/client', () => ({
  __esModule: true,
  query: async () => ({ rows: [] }),
}));

import { readFileSync } from 'fs';
import { join } from 'path';
import { LineKind, RouteKind, goalName, lineKindFrom, routeLine } from '../whatsappRouting.service';
import {
  WhichAnswer,
  answerOf,
  askWhichGoal,
  forgetHeldLines,
  takeHeldLine,
  whichQuestion,
} from '../whatsappWhichGoal';

const THREAD = 71000;
const PHONE = '12025550113';
const said = (word: string): unknown => ({
  content: [{ type: 'text', text: word }],
  usage: { input_tokens: 10, output_tokens: 1 },
});

beforeEach(() => {
  forgetHeldLines();
  mockCreate.mockReset();
  mockOpenGoal.mockReset().mockResolvedValue({
    id: 1,
    title: 'we talked before, start over',
    brief: 'მიზანი: B2B გაყიდვების სპეციალისტი სტარტაპისთვის. ორი გზა გვაქვს.',
  });
  mockCreateThread.mockReset().mockResolvedValue({ id: 99 });
  mockReply.mockReset().mockResolvedValue(undefined);
  jest.spyOn(console, 'info').mockImplementation(() => {});
});

describe('the router may say it is unsure', () => {
  it('reads the word, and tells the small model it may say it', async () => {
    expect(lineKindFrom('unsure')).toBe(LineKind.Unsure);
    mockCreate.mockResolvedValue(said('unsure'));
    const route = await routeLine(7, THREAD, 'გიორგისაც ჰკითხე');
    expect(route).toEqual({
      kind: RouteKind.Ask,
      threadId: THREAD,
      goal: 'B2B გაყიდვების სპეციალისტი სტარტაპისთვის',
    });
    expect(String(mockCreate.mock.calls[0][0].system)).toContain('unsure: the line could as well');
    expect(mockCreateThread).not.toHaveBeenCalled();
  });

  it('names the goal by its brief’s first sentence, else its title', () => {
    expect(goalName({ title: 'T', brief: 'Goal: meet the architect. Nino first.' })).toBe(
      'meet the architect',
    );
    expect(goalName({ title: 'renovation', brief: null })).toBe('renovation');
  });
});

describe('the person is asked, and the line waits', () => {
  it('asks in the line’s own language, with two buttons that fit WhatsApp', async () => {
    const ka = whichQuestion('რემონტი', 'ცეკვის მასწავლებელი');
    expect(ka.text).toBe('ეს „რემონტი"-ს ეხება, თუ ახალი მოთხოვნაა?');
    expect(ka.choices).toEqual(['ამას ეხება', 'ახალი მოთხოვნაა']);
    expect(ka.choices.every((c) => c.length <= 20)).toBe(true);
    expect(whichQuestion('renovation', 'a dance teacher').choices).toEqual([
      'About that',
      'A new request',
    ]);
    await expect(askWhichGoal(7, PHONE, THREAD, 'რემონტი', 'ცეკვა', 0)).resolves.toBe(true);
    expect(mockReply).toHaveBeenCalledWith(7, PHONE, ka.text, THREAD, [
      'ამას ეხება',
      'ახალი მოთხოვნაა',
    ]);
  });

  it('reads a tapped button or its number as the answer', () => {
    const choices = ['ამას ეხება', 'ახალი მოთხოვნაა'] as const;
    expect(answerOf('ამას ეხება', choices)).toBe(WhichAnswer.SameGoal);
    expect(answerOf(' 2 ', choices)).toBe(WhichAnswer.NewRequest);
    expect(answerOf('ორივე', choices)).toBeNull();
  });

  it('hands the held line back once, with the answer, and never after it went stale', async () => {
    await askWhichGoal(7, PHONE, THREAD, 'რემონტი', 'ცეკვის მასწავლებელი', 0);
    expect(takeHeldLine(7, 'ახალი მოთხოვნაა', 1_000)).toEqual({
      threadId: THREAD,
      line: 'ცეკვის მასწავლებელი',
      answer: WhichAnswer.NewRequest,
    });
    expect(takeHeldLine(7, '1', 2_000)).toBeNull();
    await askWhichGoal(8, PHONE, THREAD, 'რემონტი', 'x', 0);
    expect(takeHeldLine(8, '1', 31 * 60_000)).toBeNull();
  });

  it('lets a reply that is no answer move on, with the held line not lost', async () => {
    await askWhichGoal(7, PHONE, THREAD, 'რემონტი', 'ცეკვის მასწავლებელი', 0);
    expect(takeHeldLine(7, 'სხვა რამე მინდა', 1_000)).toEqual({
      threadId: THREAD,
      line: 'ცეკვის მასწავლებელი',
      answer: null,
    });
  });

  it('holds nothing when the question could not be sent', async () => {
    mockReply.mockRejectedValue(new Error('graph down'));
    jest.spyOn(console, 'error').mockImplementation(() => {});
    await expect(askWhichGoal(7, PHONE, THREAD, 'g', 'l', 0)).resolves.toBe(false);
    expect(takeHeldLine(7, '1', 1)).toBeNull();
  });
});

describe('the inbound route asks, then sends the line on', () => {
  const inbound = readFileSync(join(__dirname, '..', 'whatsappInbound.service.ts'), 'utf8');

  it('reads a held line’s answer first, and asks when the router is unsure', () => {
    expect(inbound).toContain('if (await heldLineAnswered(userId, message.from, typed)) return;');
    expect(inbound).toContain('route.kind === RouteKind.Ask');
    expect(inbound).toContain('await askWhichGoal(');
  });

  it('opens a new conversation only when the person says it is new', () => {
    expect(inbound).toMatch(/WhichAnswer\.NewRequest\s*\?\s*await newConversationFor/su);
  });
});
