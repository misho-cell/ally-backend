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
      expect(engine).toContain(`claimSweep(${slot}, REMINDER_INTERVAL_MINUTES)`);
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
