jest.mock('../../db/postgres/client', () => ({ query: jest.fn(), __esModule: true }));
jest.mock('../threads.service', () => ({
  __esModule: true,
  saveThreadMessage: jest.fn().mockResolvedValue(undefined),
  STATUS_LINES: { failed: 'ვერ დასრულდა', needs_you: 'შენ გელოდება' },
}));
jest.mock('../sse.service', () => ({ __esModule: true, emitThreadUpdated: jest.fn() }));

import { query } from '../../db/postgres/client';
import { saveThreadMessage } from '../threads.service';
import { emitThreadUpdated } from '../sse.service';
import { sweepOrphanedRuns } from '../runReaper.service';

const mockQuery = query as jest.MockedFunction<typeof query>;

beforeEach(() => jest.clearAllMocks());

function reaped(rows: unknown[]): void {
  mockQuery.mockResolvedValue({ rows, rowCount: rows.length } as never);
}

/**
 * Ticket 20 row 3 — the reaper told an owner their reply had failed while the
 * reply sat on the screen above it.
 *
 * Thread 15841, Tornike's volleyball goal, 16 September. Run fe7980fa wrote a
 * complete plan at 15:34:22. At 15:35:42 this sweep wrote „ტექნიკური შეფერხება
 * მოხდა — პასუხი ვერ დასრულდა" underneath it.
 *
 * Something left the thread on 'working' after a run finished, and that cause
 * is NOT established — two runs overlapped on that thread and both status
 * writes are fire-and-forget, which is a candidate rather than a finding.
 * Clearing the stale status is right whatever the cause. The false sentence
 * never is.
 */
describe('row 3 — the reaper does not call a delivered answer a failure', () => {
  it('writes no error when the thread answered, and still clears the status', async () => {
    reaped([
      {
        id: 15841,
        user_id: 501,
        status: 'failed',
        status_line: 'ვერ დასრულდა',
        answered: true,
        was_asked: true,
      },
    ]);

    const n = await sweepOrphanedRuns();

    expect(n).toBe(1);
    // The row was updated — a thread stuck on 'working' is a spinner that
    // never stops, and that is worth clearing on its own.
    expect(emitThreadUpdated).toHaveBeenCalled();
    // But nothing claimed the reply had failed.
    expect(saveThreadMessage).not.toHaveBeenCalled();
  });

  it('still reports a genuinely dead run, which is what the reaper is for', async () => {
    reaped([
      {
        id: 15643,
        user_id: 501,
        status: 'failed',
        status_line: 'ვერ დასრულდა',
        answered: false,
        was_asked: true,
      },
    ]);

    await sweepOrphanedRuns();

    expect(saveThreadMessage).toHaveBeenCalledTimes(1);
    const [, , , text, kind] = (saveThreadMessage as jest.Mock).mock.calls[0];
    expect(String(text)).toContain('ტექნიკური შეფერხება');
    expect(kind).toBe('error');
  });

  it('asks the database the answered question at all', async () => {
    reaped([]);

    await sweepOrphanedRuns();

    const [sql] = mockQuery.mock.calls[0] as [string];
    expect(sql).toContain('AS answered');
    expect(sql).toContain("c.role = 'assistant'");
    // An error row must not count as an answer — that is what it is replacing.
    expect(sql).toContain("c.kind = 'message'");
  });

  it('judges each reaped thread on its own, not on the batch', async () => {
    reaped([
      { id: 1, user_id: 501, status: 'failed', status_line: 'x', answered: true, was_asked: true },
      { id: 2, user_id: 501, status: 'failed', status_line: 'x', answered: false, was_asked: true },
      { id: 3, user_id: 501, status: 'failed', status_line: 'x', answered: true, was_asked: true },
      // Row 33: a newborn goal thread in the same batch, judged on its own.
      {
        id: 4,
        user_id: 501,
        status: 'failed',
        status_line: 'x',
        answered: false,
        was_asked: false,
      },
    ]);

    await sweepOrphanedRuns();

    expect(saveThreadMessage).toHaveBeenCalledTimes(1);
    expect((saveThreadMessage as jest.Mock).mock.calls[0][0]).toBe(2);
    // All four still had their stale status cleared.
    expect(emitThreadUpdated).toHaveBeenCalledTimes(4);
  });
});

/**
 * Ticket 20 row 33 — the split goal's chat that held nothing but an error.
 *
 * Thread 16905, 17 September. A second need typed into goal 4852's chat opened
 * goal 4853 on a thread of its own; the seat clicked it in the sidebar and
 * landed on „a technical delay occurred, the answer could not be finished".
 * The plan arrived two minutes later.
 *
 * This sweep wrote that, and the thread was created by the row 33 fix itself —
 * deliberately status 'working', because the plan turn is queued four seconds
 * out and „done" would have been a lie. A newborn thread is silent for the
 * same reason a newborn is, and after seventy-five seconds it looked exactly
 * like a thread whose run had died.
 */
describe('row 33 — a thread nobody has asked anything in', () => {
  it('clears the stale status but claims no failed reply', async () => {
    reaped([
      {
        id: 16905,
        user_id: 501,
        status: 'failed',
        status_line: 'ვერ დასრულდა',
        answered: false,
        was_asked: false,
      },
    ]);

    const n = await sweepOrphanedRuns();

    expect(n).toBe(1);
    // The spinner still has to stop.
    expect(emitThreadUpdated).toHaveBeenCalled();
    // „Your reply could not be finished" is a claim about a reply the owner is
    // owed, and they have not asked for one here.
    expect(saveThreadMessage).not.toHaveBeenCalled();
  });

  it('still reports a dead run on a thread the owner DID type in', async () => {
    reaped([
      {
        id: 16904,
        user_id: 501,
        status: 'failed',
        status_line: 'ვერ დასრულდა',
        answered: false,
        was_asked: true,
      },
    ]);

    await sweepOrphanedRuns();

    expect(saveThreadMessage).toHaveBeenCalledTimes(1);
  });
});
