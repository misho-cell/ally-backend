jest.mock('../../db/postgres/client', () => ({ __esModule: true, query: jest.fn() }));

import { readFileSync } from 'fs';
import { join } from 'path';

import { query } from '../../db/postgres/client';
import { claimSweep, SWEEP_SILENT_GOALS } from '../sweepClaim';

const mockQuery = query as jest.MockedFunction<typeof query>;

const rows = (data: unknown[]): { rows: unknown[]; rowCount: number } => ({
  rows: data,
  rowCount: data.length,
});

beforeEach(() => jest.clearAllMocks());

/**
 * ⚠️ WORK THAT MUST HAPPEN DAILY WAS LIVING ON A TIMER EVERY DEPLOY RESET.
 *
 * `sweepSilentGoals`, `sendDueAskReminders` and `sweepMethodChanges` shared one
 * sixty-minute `setInterval` started at boot. A deploy replaces the container,
 * so the timer restarted — and on 26 September the longest gap between deploys
 * all afternoon was TWENTY-FIVE MINUTES. None of the three ran once: nobody
 * waiting on an ask was reminded, no goal widened after a silent day, no
 * method change fired.
 *
 * The symptom was absence. No error, no row, nothing to notice — and it got
 * worse the harder we worked, which is the worst shape a scheduled job can
 * have. It surfaced only because a tester's test read as „the product did
 * nothing" when in truth nothing had looked.
 */
describe('a sweep’s clock lives in the database, not in the process', () => {
  it('runs when the slot is overdue', async () => {
    mockQuery.mockResolvedValue(rows([{ name: SWEEP_SILENT_GOALS }]) as never);

    expect(await claimSweep(SWEEP_SILENT_GOALS, 60)).toBe(true);
  });

  it('does not run when somebody claimed it recently', async () => {
    mockQuery.mockResolvedValue(rows([]) as never);

    expect(await claimSweep(SWEEP_SILENT_GOALS, 60)).toBe(false);
  });

  /**
   * ⚠️ ONE STATEMENT, NOT TWO. During a deploy the old container and the new
   * one overlap, so both can ask at the same moment. The condition rides
   * inside the UPDATE and RETURNING says who won; a read-then-write would let
   * both pass the check and both run — and for the reminder sweep that means
   * a person gets the same reminder twice.
   */
  it('claims atomically, condition and write in one statement', async () => {
    mockQuery.mockResolvedValue(rows([]) as never);

    await claimSweep(SWEEP_SILENT_GOALS, 60);

    const [sql] = mockQuery.mock.calls[0] as [string];
    expect(sql).toContain('UPDATE sweep_runs');
    expect(sql).toContain('SET last_run_at = NOW()');
    expect(sql).toContain("last_run_at < NOW() - ($2 || ' minutes')::interval");
    expect(sql).toContain('RETURNING name');
    expect(mockQuery).toHaveBeenCalledTimes(1);
  });

  /** A hiccup must not become a reason to repeat something a person receives. */
  it('answers false when it cannot tell', async () => {
    mockQuery.mockRejectedValue(new Error('pool exhausted') as never);

    expect(await claimSweep(SWEEP_SILENT_GOALS, 60)).toBe(false);
  });
});

describe('the engine asks before it sweeps', () => {
  const engine = readFileSync(join(__dirname, '..', 'taskEngine.service.ts'), 'utf8');

  it('gates all three starved sweeps on a claim', () => {
    for (const slot of ['SWEEP_ASK_REMINDERS', 'SWEEP_SILENT_GOALS', 'SWEEP_METHOD_CHANGES']) {
      expect(engine).toContain(`claimSweep(${slot}, CLAIM_WINDOW_MINUTES)`);
    }
  });

  /**
   * Without a boot run, a container replacing one that died mid-hour still
   * waits a full interval before even asking — the same starvation, smaller.
   */
  it('asks once shortly after boot, not only on the hour', () => {
    expect(engine).toContain('setTimeout(runHourlySweeps, BOOT_SWEEP_DELAY_MS)');
  });

  /** The migration seeds the slots in the PAST, so a fresh database is due. */
  it('seeds a new slot as overdue rather than as just-run', () => {
    const migration = readFileSync(
      join(
        __dirname,
        '..',
        '..',
        'db',
        'postgres',
        'migrations',
        '181_a_sweep_remembers_when_it_last_ran.sql',
      ),
      'utf8',
    );
    expect(migration).toContain("NOW() - INTERVAL '1 day'");
    expect(migration).not.toMatch(/VALUES\s*\('ask_reminders',\s*NOW\(\)\)/);
  });
});

/**
 * ⚠️ A STAMP THAT SAYS „WIDENED" WHEN NOBODY WAS WRITTEN TO.
 *
 * The silent-day sweep stamps a goal BEFORE waking it, so a run that dies
 * cannot make the sweep fire again on its next pass. That is right. But the
 * same stamp is what the candidate query reads to mean „this goal has had its
 * widening", and it believes it for twenty-four hours.
 *
 * So a wake REFUSED — the thread busy, a live run holding it — left a goal
 * marked as widened when nothing had happened. The tester found it on goal
 * 6833: stamped 17:55:53 on 26 September, activity never moved, and the log
 * said the sweep woke FOUR of the five it had stamped. Four was the number
 * that mattered; „five stamps" was, again, not the same fact as „five
 * widenings".
 *
 * Only a temporary refusal is given back. 'stopped' means nothing a retry can
 * change, and clearing that would hand one of the five slots, every hour, to a
 * goal that will refuse again — row 278's starvation, rebuilt by hand.
 */
describe('a refused wake gives the stamp back', () => {
  const engine = readFileSync(join(__dirname, '..', 'taskEngine.service.ts'), 'utf8');
  const sweep = engine.slice(
    engine.indexOf('export async function sweepSilentGoals'),
    engine.indexOf('async function nightlyReview'),
  );

  it('clears the stamp when the thread was busy', () => {
    expect(sweep).toContain("else if (ok === 'busy') await unmarkSilentDayWoken(task.id)");
  });

  it('keeps it on a stop, so a goal that cannot run does not eat a slot hourly', () => {
    expect(sweep).not.toContain("'stopped'");
  });

  it('still stamps before the wake, not after it', () => {
    expect(sweep.indexOf('markSilentDayWoken')).toBeLessThan(sweep.indexOf('await wakeTask'));
  });

  it('writes NULL and nothing else', async () => {
    mockQuery.mockResolvedValue(rows([]) as never);
    const { unmarkSilentDayWoken } = await import('../taskStore.service');

    await unmarkSilentDayWoken(6833);

    const [sql, params] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('SET silent_day_woken_at = NULL');
    expect(sql).toContain('WHERE id = $1');
    expect(params[0]).toBe(6833);
  });
});

/**
 * And the stamp is readable from outside, because the tester could not see it.
 * Their test of „did the widening reach my goal" was being run against
 * `last_activity_at`, which every ordinary wake also moves — two facts under
 * one column, which is this week's whole story.
 */
describe('the widening stamp can be read without the database', () => {
  const dashboard = readFileSync(join(__dirname, '..', 'goalDashboard.service.ts'), 'utf8');

  it('is selected, typed and returned by the goal read', () => {
    expect(dashboard).toContain('t.silent_day_woken_at');
    expect(dashboard).toContain('silent_day_woken_at: iso(row.silent_day_woken_at)');
    expect(dashboard).toContain('silent_day_woken_at: string | null;');
  });
});

/**
 * ⚠️ AN HOURLY JOB THAT RAN EVERY TWO HOURS, AND NOTHING REPORTED IT.
 *
 * The timer runs from boot; the boot sweep at boot + 45 s is what claims the
 * slot. So the slot's clock is 45 seconds ahead of the timer's, and an hourly
 * claim window refuses the tick at boot + 60 min for being 45 seconds early.
 * A refusal leaves the slot untouched, so the FOLLOWING tick is the first that
 * passes — hourly work every two hours, with no error anywhere.
 *
 * The window is the fix and this is what keeps it a window.
 */
describe('the claim window is shorter than the timer that opens it', () => {
  const engine = readFileSync(join(__dirname, '..', 'taskEngine.service.ts'), 'utf8');
  const literal = (name: string): number => {
    const m = engine.match(new RegExp(`const ${name} = ([0-9_]+);`));
    if (!m) throw new Error(`${name} is no longer a plain number`);
    return Number(m[1].replace(/_/g, ''));
  };

  it('is defined as the timer minus real slack, not as its own number', () => {
    expect(engine).toContain('const CLAIM_WINDOW_MINUTES = REMINDER_INTERVAL_MINUTES - 5;');
  });

  /** The slack must cover the boot delay, which is where the drift comes from. */
  it('covers the boot delay it exists for', () => {
    expect(5 * 60_000).toBeGreaterThan(literal('BOOT_SWEEP_DELAY_MS'));
  });

  /** And not so much slack that two ticks of one hour could both claim. */
  it('is still most of an hour', () => {
    expect(literal('REMINDER_INTERVAL_MINUTES') - 5).toBeGreaterThan(30);
  });
});
