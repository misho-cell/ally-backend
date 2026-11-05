jest.mock('../../db/postgres/client', () => ({ __esModule: true, query: jest.fn() }));

import { readFileSync } from 'fs';
import { join } from 'path';
import { query } from '../../db/postgres/client';
import { goalSentNothing } from '../goalSentNothing';
import { claimsAnAskWasSent, claimsASendNow, NOTHING_SENT_YET_NUDGE } from '../replyGuards';
import { isModelOnlyNudge } from '../chat.service';
import { ClaimKind } from '../replyClaims.service';
import { claimsRead } from './helpers/replyClaims';

/**
 * #2113 (tester 43066, conv 41598): the owner approved, and the reply said
 * „I have already written to Nika's and Mari's assistants" — the goal had sent
 * nothing to anybody.
 */
const mockQuery = query as jest.MockedFunction<typeof query>;

describe('a claimed send', () => {
  it('is the model’s reading of a send that already went (#8779 c)', () => {
    const said = 'მარის ვკითხე, პასუხს ველოდები.';
    expect(claimsAnAskWasSent(claimsRead({ [ClaimKind.Sent]: [said] }))).toBe(true);
    expect(claimsAnAskWasSent(claimsRead({ [ClaimKind.SendingNow]: [said] }))).toBe(false);
    expect(claimsAnAskWasSent(claimsRead({}))).toBe(false);
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
      '(claimsAnAskWasSent(claims) || saysItSendsNowWithoutApproval(runId, claims)) &&',
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
  it('is the model’s reading of a send right now', () => {
    const now = 'ახლავე ვუწერ ორივეს.';
    expect(claimsASendNow(claimsRead({ [ClaimKind.SendingNow]: [now] }))).toBe(true);
    expect(claimsASendNow(claimsRead({ [ClaimKind.Sent]: [now] }))).toBe(false);
  });

  it('the run counts it only when it approved no plan and the line was no approve tap', () => {
    const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
    expect(chat).toContain(
      '(claimsAnAskWasSent(claims) || saysItSendsNowWithoutApproval(runId, claims))',
    );
    expect(chat).toContain('!runApprovedAPlan.has(runId) &&');
  });
});
