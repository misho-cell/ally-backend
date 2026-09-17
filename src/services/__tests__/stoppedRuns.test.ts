import { markThreadStopped, noteRunStart, resetStoppedRuns, runWasStopped } from '../stoppedRuns';

/**
 * Ticket 20 row 113, fourth pass — a stop must stop the RUN, not just the goal.
 *
 * Read by the tester on c7f8de1, goal 4489 / thread 16635, the button pressed
 * 20 seconds into the first run:
 *
 *   13:16:16  the stop line
 *   13:16:33  present_choices        the run, still going
 *   13:16:40  its reply, with approve / change buttons
 *
 * The register was correct throughout — stage stopped, asks_sent 0 — and the
 * owner was still asked to approve a plan by the goal they had just stopped.
 */
beforeEach(() => resetStoppedRuns());

describe('runWasStopped', () => {
  it('is false for a run nobody stopped', () => {
    noteRunStart('run-a');

    expect(runWasStopped(16635, 'run-a')).toBe(false);
  });

  it('is true for the run that was working when the stop arrived', () => {
    noteRunStart('run-a');
    markThreadStopped(16635);

    expect(runWasStopped(16635, 'run-a')).toBe(true);
  });

  it('does NOT stop the next run the owner starts', () => {
    // The whole reason this is a counter and not a flag. A person who stops
    // a goal and then types again is owed an answer.
    noteRunStart('run-a');
    markThreadStopped(16635);
    noteRunStart('run-b');

    expect(runWasStopped(16635, 'run-b')).toBe(false);
  });

  it('does not reach across threads', () => {
    noteRunStart('run-a');
    markThreadStopped(99999);

    expect(runWasStopped(16635, 'run-a')).toBe(false);
  });

  it('is false for a run this process never saw start', () => {
    // A record aged out, or a container replaced. The safe direction: a wrong
    // false costs one late answer, a wrong true costs an answer the owner
    // asked for and never receives.
    markThreadStopped(16635);

    expect(runWasStopped(16635, 'run-from-a-dead-container')).toBe(false);
  });
});
