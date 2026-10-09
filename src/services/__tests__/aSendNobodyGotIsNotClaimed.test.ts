jest.mock('../../db/postgres/client', () => ({ __esModule: true, query: jest.fn() }));

import { readFileSync } from 'fs';
import { join } from 'path';
import { query } from '../../db/postgres/client';
import { goalSentNothing } from '../goalSentNothing';
import { claimsAnAskWasSent, claimsASendNow, NOTHING_SENT_YET_NUDGE } from '../replyGuards';
import { isModelOnlyNudge } from '../chat.service';

/**
 * #2113 (tester 43066, conv 41598): the owner approved, and the reply said
 * „I have already written to Nika's and Mari's assistants" — the goal had sent
 * nothing to anybody.
 */
const mockQuery = query as jest.MockedFunction<typeof query>;

describe('a claimed send', () => {
  it.each([
    'გეგმა დამტკიცებულია, ნიკასა და მარის ასისტენტებს უკვე დავწერე.',
    'მარის ვკითხე, პასუხს ველოდები.',
    "I've written to Mari's assistant.",
    'I asked Nika about it.',
  ])('is read in „%s"', (text) => {
    expect(claimsAnAskWasSent(text)).toBe(true);
  });

  it.each([
    'მარის ჯერ არ მივწერე.',
    'ვერ ვკითხე, რადგან ნომერი არ აქვს.',
    'ახლა ვწერ ნიკას და მარის.',
    'I will write to Mari now.',
  ])('is not read in „%s"', (text) => {
    expect(claimsAnAskWasSent(text)).toBe(false);
  });

  it('gets a note the owner never sees', () => {
    expect(isModelOnlyNudge(NOTHING_SENT_YET_NUDGE)).toBe(true);
  });

  it('is caught before the members note, and replaces the first answer', () => {
    const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
    const chain = chat.slice(chat.indexOf('const guardNudge ='));
    expect(chain.indexOf('NOTHING_SENT_YET_NUDGE')).toBeLessThan(
      chain.indexOf('MEMBERS_SKIPPED_NUDGE'),
    );
    expect(chat).toContain(
      '(claimsAnAskWasSent(finalText) || saysItSendsNowWithoutApproval(runId, finalText)) &&',
    );
  });
});

describe('a goal that sent nothing', () => {
  beforeEach(() => mockQuery.mockReset());

  it('reads asks, cards and introductions, scoped to the conversation, with a timeout', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ silent: true }] } as never);
    await expect(goalSentNothing(41598)).resolves.toBe(true);
    const [sql, params, timeout] = mockQuery.mock.calls[0];
    expect(String(sql)).toContain('task_asks');
    expect(String(sql)).toContain('held_asks');
    expect(String(sql)).toContain('introduction_requests');
    expect(params).toEqual([41598]);
    expect(timeout).toBeGreaterThan(0);
  });

  it('does not accuse when it cannot look', async () => {
    mockQuery.mockRejectedValueOnce(new Error('timeout'));
    await expect(goalSentNothing(41598)).resolves.toBe(false);
  });
});

describe('a send said in the present, on a run that approved nothing (2113, MTR #7)', () => {
  it.each([
    'გეგმა შევცვალე და ნინოს ახლა ვწერ.',
    'ახლავე ვუწერ ორივეს.',
    "I'm writing to Nino now.",
    'Sending it now.',
  ])('„%s" reads as a send now', (reply) => expect(claimsASendNow(reply)).toBe(true));

  it('the past-tense reader still leaves „ახლა ვწერ" alone (true right after an approval)', () => {
    expect(claimsAnAskWasSent('ახლა ვწერ ნიკას და მარის.')).toBe(false);
  });

  it('the run counts it only when it approved no plan and the line was no approve tap', () => {
    const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
    expect(chat).toContain(
      '(claimsAnAskWasSent(finalText) || saysItSendsNowWithoutApproval(runId, finalText))',
    );
    expect(chat).toContain('!runApprovedAPlan.has(runId) &&');
  });
});
