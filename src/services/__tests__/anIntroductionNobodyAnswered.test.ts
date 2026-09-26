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
  introductionsThatWouldExpire,
  introductionExpiryCounts,
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

/**
 * ⚠️ A DRY RUN THAT READS A DIFFERENT SET FROM THE SWEEP IS WORSE THAN NO DRY
 * RUN — it shows somebody sixteen rows and changes seventeen. Misho's word
 * („approve all and do them") is what makes this route run at all, and the
 * preview is the last thing between that word and sixteen real people.
 */
describe('the preview previews the thing that will happen', () => {
  const source = readFileSync(join(__dirname, '..', 'introductionExpiry.service.ts'), 'utf8');

  it('shares one WHERE clause between the preview and the sweep', () => {
    expect(source).toContain('const PAST_THE_DEADLINE = `');
    expect(source).toContain('${PAST_THE_DEADLINE}');
    // The sweep's own subquery states the same two conditions.
    expect(source).toContain("status = 'pending'");
  });

  it('reads the same fourteen days, from the same constant', async () => {
    mockQuery.mockResolvedValue({ rows: [], rowCount: 0 } as never);

    await introductionsThatWouldExpire();

    const [, params] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(params[0]).toBe(14);
    expect(params[1]).toBe(50);
  });

  it('writes nothing and tells nobody', async () => {
    mockQuery.mockResolvedValue({ rows: [], rowCount: 0 } as never);

    await introductionsThatWouldExpire();

    const [sql] = mockQuery.mock.calls[0] as [string];
    expect(sql).not.toMatch(/UPDATE|INSERT|DELETE/);
    expect(mockQueue).not.toHaveBeenCalled();
  });

  /** And the route refuses to write unless somebody says so in the body. */
  it('the route only writes on an explicit confirm', () => {
    const routes = readFileSync(
      join(__dirname, '..', '..', 'api', 'routes', 'admin.routes.ts'),
      'utf8',
    );
    const route = routes.slice(routes.indexOf("'/introductions/expire'"));

    expect(route.slice(0, 2000)).toContain('.confirm === true');
    expect(route.slice(0, 2000)).toContain('if (!confirm)');
    // The ids come back, because the ids are the undo.
    expect(route.slice(0, 3000)).toContain('ids: expired.map((e) => e.id)');
  });
});

/**
 * ⚠️ A DRY RUN IS NOT A READ, AND THE TESTER'S SEAT WAS RIGHT TO SAY SO.
 *
 * `POST /admin/introductions/expire` without `confirm` writes nothing — but
 * their safety check reads the METHOD, not the body, and refused it. A guard
 * that has to open a payload to decide whether something is safe is not a
 * guard, and „it is only a write if you send the wrong field" is a promise in
 * prose. So row 275 stayed unreadable from the one seat whose job is to read
 * it, and the answer is a route that cannot write whatever is sent to it.
 */
describe('the half of row 275 that can only read', () => {
  const routes = readFileSync(
    join(__dirname, '..', '..', 'api', 'routes', 'admin.routes.ts'),
    'utf8',
  );
  // Bounded at the next route, so an edit further down the file cannot make
  // this pass or fail for a reason that has nothing to do with it.
  const readRoute = (() => {
    const start = routes.indexOf("adminRouter.get('/introductions/expiring'");
    return routes.slice(start, routes.indexOf('adminRouter.post(', start));
  })();

  it('is a GET, so the method alone settles whether it can write', () => {
    expect(readRoute).toContain("adminRouter.get('/introductions/expiring'");
    expect(readRoute).not.toMatch(/expireUnansweredRequests|tellAskersTheirRequestExpired/);
  });

  it('returns the ids, because the ids are what makes the count checkable', () => {
    expect(readRoute).toContain('ids: waiting.map((r) => r.id)');
    expect(readRoute).toContain('pending_past_deadline');
    expect(readRoute).toContain('already_expired');
    expect(readRoute).toContain('expires_after_days: EXPIRES_AFTER_DAYS');
  });

  it('counts with the sweep’s own clause and writes nothing', async () => {
    mockQuery.mockResolvedValue({
      rows: [{ pending_past_deadline: 16, already_expired: 0 }],
      rowCount: 1,
    } as never);

    const counts = await introductionExpiryCounts();

    const [sql, params] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(sql).not.toMatch(/UPDATE|INSERT|DELETE/);
    expect(sql).toContain(
      "COALESCE(ir.responded_at, ir.created_at) < NOW() - ($1 || ' days')::INTERVAL",
    );
    expect(params[0]).toBe(14);
    expect(params[1]).toBe('expired');
    expect(counts).toEqual({ pending_past_deadline: 16, already_expired: 0 });
    expect(mockQueue).not.toHaveBeenCalled();
  });

  /** An empty result is zero, not a crash and not an undefined read further up. */
  it('says zero when the table answers with nothing', async () => {
    mockQuery.mockResolvedValue({ rows: [], rowCount: 0 } as never);

    expect(await introductionExpiryCounts()).toEqual({
      pending_past_deadline: 0,
      already_expired: 0,
    });
  });
});

/**
 * ⚠️ THE STATUS THE TABLE WOULD NOT HOLD, AND HOW I MISSED IT.
 *
 * Before building any of this I asked `information_schema` whether `status`
 * carried a check constraint. It answered NULL and I read null as „there is no
 * constraint". Null meant the query could not see one — the join I wrote
 * through `constraint_column_usage` does not reach a CHECK the way I assumed.
 *
 * „I could not look" read as „I looked and found nothing", by the person who
 * put those exit codes into the ops scripts. `pg_get_constraintdef` says it in
 * one line, and the real constraint listed four statuses and not five.
 *
 * The cost was one refused write: the sweep threw, the transaction rolled
 * back, all sixteen rows stayed `pending`, and not one of the sixteen askers
 * was told anything. That is the one direction this write is allowed to fail
 * in, and it is why `confirm` and a dry run exist at all.
 */
describe('the database will hold the status we invented', () => {
  it('has a migration that admits expired', () => {
    const migration = readFileSync(
      join(
        __dirname,
        '..',
        '..',
        'db',
        'postgres',
        'migrations',
        '179_an_introduction_can_expire.sql',
      ),
      'utf8',
    );

    expect(migration).toContain('introduction_requests_status_check');
    expect(migration).toContain("'expired'");
    // The four that were always allowed are still allowed.
    for (const kept of ['pending', 'accepted', 'declined', 'cancelled']) {
      expect(migration).toContain(`'${kept}'`);
    }
  });

  /** The sweep writes exactly the word the constraint now admits. */
  it('writes the same word the constraint allows', async () => {
    mockQuery.mockResolvedValue({ rows: [], rowCount: 0 } as never);

    await expireUnansweredRequests();

    expect((mockQuery.mock.calls[0] as [string, unknown[]])[1][0]).toBe('expired');
  });
});
