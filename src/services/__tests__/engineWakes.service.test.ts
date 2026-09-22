jest.mock('../../db/postgres/client', () => ({ __esModule: true, query: jest.fn() }));

import { query } from '../../db/postgres/client';
import {
  abandonExhaustedWakes,
  claimOverdueWakes,
  DAY_ONE_WAKE,
  finishWake,
  recordWake,
} from '../engineWakes.service';

const mockQuery = query as jest.MockedFunction<typeof query>;
const sqlOf = (call: number): string => String(mockQuery.mock.calls[call][0]);

/**
 * Ticket 20 rows 231 and 239.
 *
 * A wake lives in a setTimeout inside the process, so a restart between an
 * approval and its wake loses it with nothing on disk to retry. Measured
 * 22 September over the previous week's 41 approvals: 30 got their first day
 * in 7-67 seconds; ELEVEN were rescued a DAY later by the fallback — while the
 * product told the owner, in the refusal it writes itself, that day one was
 * already starting behind their reply.
 *
 * These tests hold the properties that make the net safe rather than merely
 * present: it cannot throw, it cannot double-run a wake, and it cannot wake a
 * goal for ever.
 */
beforeEach(() => {
  jest.clearAllMocks();
  mockQuery.mockResolvedValue({ rows: [] } as never);
});

describe('recording a wake', () => {
  it('writes the row with its due time and says nothing on a duplicate', async () => {
    await recordWake(7, DAY_ONE_WAKE, 3_000);

    const sql = sqlOf(0);
    expect(sql).toContain('INSERT INTO engine_wakes');
    expect(sql).toContain('ON CONFLICT DO NOTHING');
    // Seconds, because make_interval takes seconds and the caller thinks in ms.
    expect(mockQuery.mock.calls[0][1]).toEqual([7, DAY_ONE_WAKE, 3]);
  });

  /**
   * A goal must not fail to be approved because the net could not be written.
   * The timer is still there and so is the day-long floor; losing the row only
   * costs the improvement, never the work.
   */
  it('never throws when the database refuses it', async () => {
    const quiet = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    mockQuery.mockRejectedValue(new Error('statement timeout'));

    await expect(recordWake(7, DAY_ONE_WAKE, 3_000)).resolves.toBeUndefined();

    expect(quiet).toHaveBeenCalled();
    quiet.mockRestore();
  });

  it('finishing is also silent about its own failure', async () => {
    const quiet = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    mockQuery.mockRejectedValue(new Error('gone'));

    await expect(finishWake(7, DAY_ONE_WAKE)).resolves.toBeUndefined();

    quiet.mockRestore();
  });

  it('finishing only closes a wake that is still open', async () => {
    await finishWake(7, DAY_ONE_WAKE);

    expect(sqlOf(0)).toContain('done_at IS NULL');
  });
});

describe('claiming the overdue ones', () => {
  /**
   * The claim is the whole safety of this design: an UPDATE ... RETURNING, so
   * the timer and the sweeper cannot both run one wake. A SELECT followed by
   * an UPDATE would leave exactly the window this table exists to close.
   */
  it('claims atomically, never selects and then updates', async () => {
    await claimOverdueWakes(5);

    const sql = sqlOf(0);
    expect(sql).toContain('UPDATE engine_wakes SET claimed_at = NOW()');
    expect(sql).toContain('RETURNING');
    expect(sql).toContain('FOR UPDATE SKIP LOCKED');
  });

  it('waits out the timer before taking anything', () => {
    // The timer's own window is the delay plus fifteen retries at six seconds.
    // Claiming sooner would race a timer that is still working.
    void claimOverdueWakes(5);
    expect(mockQuery.mock.calls[0][1]).toEqual([5, 5, 120, 300]);
  });

  it('will not take a wake that has used its attempts', async () => {
    await claimOverdueWakes(5);

    expect(sqlOf(0)).toContain('attempts < $2');
  });

  it('takes back a claim whose process died, so nothing is stuck for ever', async () => {
    await claimOverdueWakes(5);

    expect(sqlOf(0)).toContain('claimed_at IS NULL OR claimed_at <');
  });

  it('gives back what it took, typed', async () => {
    mockQuery.mockResolvedValue({
      rows: [{ id: '12', task_id: 6865, kind: DAY_ONE_WAKE, attempts: 2 }],
    } as never);

    const claimed = await claimOverdueWakes(5);

    expect(claimed).toEqual([{ id: '12', taskId: 6865, kind: DAY_ONE_WAKE, attempts: 2 }]);
  });
});

describe('giving up', () => {
  /**
   * The row is closed, not deleted. „Tried five times and never got in" is a
   * different fact from „nobody ever queued it", and only a row that stays can
   * tell them apart later.
   */
  it('closes an exhausted wake and leaves it readable', async () => {
    mockQuery.mockResolvedValue({ rows: [{ id: '1' }, { id: '2' }] } as never);

    const given = await abandonExhaustedWakes();

    expect(given).toBe(2);
    const sql = sqlOf(0);
    expect(sql).toContain('SET done_at = NOW()');
    expect(sql).not.toContain('DELETE');
  });
});
