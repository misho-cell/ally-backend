jest.mock('../../db/postgres/client', () => ({ __esModule: true, query: jest.fn() }));
jest.mock('../pendingUpdates.service', () => ({
  __esModule: true,
  queueResult: jest.fn().mockResolvedValue({ id: 1 }),
}));

import { readFileSync } from 'fs';
import { join } from 'path';

import { query } from '../../db/postgres/client';
import { queueResult } from '../pendingUpdates.service';
import {
  expireUnansweredRequests,
  tellAskersTheirRequestExpired,
  EXPIRES_AFTER_DAYS,
} from '../introductionExpiry.service';
import { renderPendingMessage } from '../pendingMessages';

const mockQuery = query as jest.MockedFunction<typeof query>;
const mockQueue = queueResult as jest.MockedFunction<typeof queueResult>;

/**
 * ROW 275 / §55 — D496: „introduction requests unanswered for 14 days expire;
 * the asker is told and may ask again; the helper sees 'expired'."
 *
 * Sixteen have been pending since between 19 June and 5 September — read from
 * the base, not quoted from a ticket. Every one is somebody who asked for
 * something and has heard nothing since. „Pending" is the truthful word for
 * the row and the wrong word for the situation: nothing is pending about a
 * question asked in June.
 */
beforeEach(() => jest.clearAllMocks());

describe('fourteen days is one number, not two', () => {
  /**
   * ⚠️ `requestIntroduction` ALREADY stops calling a request „already sent"
   * after fourteen days, with the same reasoning written beside it: „a
   * mediator who has not looked in a fortnight is not about to." That rule and
   * this one are the same fact about the same row. Two numbers about one thing
   * is the fault this codebase keeps paying for, so there is one constant and
   * this test is what stops a second appearing.
   */
  it('expires on the same day the duplicate guard stops counting it', () => {
    const tool = readFileSync(join(__dirname, '..', 'tools', 'requestIntroduction.ts'), 'utf8');
    const expiry = readFileSync(join(__dirname, '..', 'introductionExpiry.service.ts'), 'utf8');

    expect(EXPIRES_AFTER_DAYS).toBe(14);
    expect(tool).toContain('export const UNANSWERED_IS_STALE_DAYS = 14;');
    expect(expiry).toContain(
      "import { UNANSWERED_IS_STALE_DAYS } from './tools/requestIntroduction'",
    );
    // No second literal anywhere in the expiry service.
    expect(expiry).not.toMatch(/=\s*14\b/);
  });
});

describe('what the sweep does, and what it refuses to do', () => {
  it('expires only pending requests past the deadline', async () => {
    mockQuery.mockResolvedValue({ rows: [], rowCount: 0 } as never);

    await expireUnansweredRequests();

    const [sql, params] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain("status = 'pending'");
    expect(sql).toContain("COALESCE(responded_at, created_at) < NOW() - ($2 || ' days')::INTERVAL");
    expect(params[0]).toBe('expired');
    expect(params[1]).toBe(14);
  });

  /**
   * ⚠️ THE ROWS IT CHANGED ARE THE ROWS IT RETURNS. A sweep that marks and
   * then says „done" leaves the telling to a second query that may read a
   * different set — and the person whose request quietly died is exactly the
   * person this row exists for.
   */
  it('returns what it changed, from the same statement', async () => {
    mockQuery.mockResolvedValue({ rows: [], rowCount: 0 } as never);

    await expireUnansweredRequests();

    const [sql] = mockQuery.mock.calls[0] as [string];
    expect(sql).toContain('RETURNING ir.id');
    expect(sql).toContain('ir.requester_user_id');
    expect(sql).toContain('AS days_waiting');
  });

  /** A sweep touches real people's rows; a runaway one must not touch all of them. */
  it('is bounded, however it is called', async () => {
    mockQuery.mockResolvedValue({ rows: [], rowCount: 0 } as never);

    await expireUnansweredRequests(100_000);

    expect((mockQuery.mock.calls[0] as [string, unknown[]])[1][2]).toBe(50);
  });

  /**
   * ⚠️ THE ASKER IS TOLD; THE HELPER IS NOT CHASED. Somebody who has not
   * answered in a fortnight has already said what they are going to say, and a
   * card telling them they missed something is a reproach nobody asked us to
   * deliver.
   */
  it('queues a card for the asker and nothing for the helper', async () => {
    await tellAskersTheirRequestExpired([
      { id: 1057, requester_user_id: '501', target_name: 'Nino', days_waiting: 20 },
    ]);

    expect(mockQueue).toHaveBeenCalledTimes(1);
    const [userId, taskId, kind, payload] = mockQueue.mock.calls[0];
    expect(userId).toBe('501');
    expect(taskId).toBeNull();
    expect(kind).toBe('intro_expired');
    const instruction = String((payload as Record<string, unknown>).instruction);
    expect(instruction).toContain('Do not write to the person who did not answer');
    // Silence is not a refusal — they may never have seen it.
    expect(instruction).toContain('do not present the silence as their refusal');
  });
});

describe('what the asker reads', () => {
  const card = (payload: Record<string, unknown>) =>
    renderPendingMessage({ kind: 'intro_expired', task_id: null, payload }, 'en');

  it('says it is closed AND that they may ask again', () => {
    const out = card({ who: 'Nino', days_waiting: 20, request_id: 1057 });

    expect(out?.text).toContain('Nino');
    expect(out?.text).toContain('20 days');
    expect(out?.text).toContain('closed');
    expect(out?.text).toContain('try again');
    expect(out?.choices?.[0]).toBe('Try again');
  });

  /** It must not read as a refusal by the other person. */
  it('does not say anybody said no', () => {
    const out = card({ who: 'Nino', days_waiting: 20 });

    expect(out?.text).not.toMatch(/refus|declin|said no/i);
  });

  it('says nothing at all when it cannot name who it was about', () => {
    expect(card({ days_waiting: 20 })).toBeNull();
    expect(card({ who: 'Nino' })).toBeNull();
  });
});

/**
 * An expired request stops being counted and stops being offered, with no
 * change needed here: both readers already require `ir.status = 'pending'`.
 * Asserted because that is load-bearing and invisible from this file.
 */
describe('an expired request keeps no card', () => {
  it('drops out of the release query and the held count on its own', () => {
    const updates = readFileSync(join(__dirname, '..', 'pendingUpdates.service.ts'), 'utf8');
    const guards = updates.match(/ir\.status = 'pending'/g) ?? [];

    expect(guards).toHaveLength(2);
  });
});
