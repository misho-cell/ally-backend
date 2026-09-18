import {
  clearThreadQueue,
  enterThread,
  leaveThread,
  threadHolder,
  threadQueueLength,
} from '../threadRunQueue';

/**
 * Ticket 20 row 209, second half. See threadRunQueue for the two live cases —
 * goal 5580's double approval and thread 16765's sentence typed in two
 * messages — and for why the engine's own half of this guard was not enough.
 */
const BUDGET_MS = 1_000;
const POLL_MS = 5;

beforeEach(() => clearThreadQueue());
afterEach(() => clearThreadQueue());

describe('one conversation, one run', () => {
  it('lets the first run straight in', async () => {
    expect(await enterThread(17568, 'run-a', BUDGET_MS, POLL_MS)).toBe('free');
    expect(threadHolder(17568)).toBe('run-a');
  });

  it('makes the second wait, and hands it the thread when the first settles', async () => {
    await enterThread(17568, 'run-a', BUDGET_MS, POLL_MS);
    const second = enterThread(17568, 'run-b', BUDGET_MS, POLL_MS);

    // Still A's until A lets go — this is the whole point. On goal 5580 both
    // runs were inside approve_task_plan 1.5 seconds apart.
    await Promise.resolve();
    expect(threadHolder(17568)).toBe('run-a');
    expect(threadQueueLength(17568)).toBe(1);

    leaveThread(17568, 'run-a');
    expect(await second).toBe('waited');
    expect(threadHolder(17568)).toBe('run-b');
    expect(threadQueueLength(17568)).toBe(0);
  });

  it('admits waiters in the order the owner spoke', async () => {
    await enterThread(17568, 'run-a', BUDGET_MS, POLL_MS);
    const order: string[] = [];
    const b = enterThread(17568, 'run-b', BUDGET_MS, POLL_MS).then(() => order.push('b'));
    const c = enterThread(17568, 'run-c', BUDGET_MS, POLL_MS).then(() => order.push('c'));

    leaveThread(17568, 'run-a');
    await b;
    leaveThread(17568, 'run-b');
    await c;

    // Two sentences typed in order are answered in order — thread 16765's
    // „გიორგი ხატიაშვილის" / „მოწვევა მინდა" the right way round.
    expect(order).toEqual(['b', 'c']);
  });

  it('never blocks a DIFFERENT conversation', async () => {
    await enterThread(17568, 'run-a', BUDGET_MS, POLL_MS);
    expect(await enterThread(16765, 'run-b', BUDGET_MS, POLL_MS)).toBe('free');
  });

  it('ignores a release from a run that does not hold the thread', async () => {
    await enterThread(17568, 'run-a', BUDGET_MS, POLL_MS);
    leaveThread(17568, 'run-stranger');
    expect(threadHolder(17568)).toBe('run-a');
  });

  it('frees the thread when the last run leaves', async () => {
    await enterThread(17568, 'run-a', BUDGET_MS, POLL_MS);
    leaveThread(17568, 'run-a');
    expect(threadHolder(17568)).toBeUndefined();
  });
});

describe('when a run never lets go', () => {
  it('takes the thread rather than stalling the conversation for ever', async () => {
    await enterThread(17568, 'leaked', 60_000, POLL_MS);
    const taken = await enterThread(17568, 'run-b', 20, POLL_MS);
    expect(taken).toBe('took_over');
    expect(threadHolder(17568)).toBe('run-b');
    expect(threadQueueLength(17568)).toBe(0);
  });

  it('does not let the run it took over from release the thread underneath it', async () => {
    await enterThread(17568, 'leaked', 60_000, POLL_MS);
    await enterThread(17568, 'run-b', 20, POLL_MS);

    // The leaked run finally finishes and releases. It is not the holder any
    // more, so nothing happens — without this, a third message would find the
    // thread free while run-b is still working in it.
    leaveThread(17568, 'leaked');
    expect(threadHolder(17568)).toBe('run-b');
  });

  it('a run that gave up waiting is no longer in the queue', async () => {
    await enterThread(17568, 'run-a', 60_000, POLL_MS);
    await enterThread(17568, 'run-b', 20, POLL_MS);
    // run-b took over; it must not ALSO still be waiting, or run-a's eventual
    // release would admit it a second time.
    expect(threadQueueLength(17568)).toBe(0);
  });

  /**
   * The bug in my first version of this module, which timed the WAIT.
   *
   * Three messages on one conversation: the third waits out the first run and
   * the second one, so its own wait passes any budget a single run could
   * justify — and it would then have declared the perfectly healthy run ahead
   * of it dead and started alongside it. The busier the conversation, the more
   * certain that was to happen, which is precisely backwards.
   */
  it('does not take the thread from a run that has only just been handed it', async () => {
    const budget = 60;
    await enterThread(17568, 'run-a', budget, POLL_MS);
    const b = enterThread(17568, 'run-b', budget, POLL_MS);
    const c = enterThread(17568, 'run-c', budget, POLL_MS);

    await new Promise((resolve) => setTimeout(resolve, 50));
    leaveThread(17568, 'run-a');
    expect(await b).toBe('waited');

    // run-c has now been waiting longer than the budget, and must still be
    // waiting, because run-b has held the thread for no time at all.
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(threadHolder(17568)).toBe('run-b');

    leaveThread(17568, 'run-b');
    expect(await c).toBe('waited');
  });
});
