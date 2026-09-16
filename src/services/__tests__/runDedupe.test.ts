import { claimRun, clearRunClaims, releaseRun } from '../runDedupe';

beforeEach(() => clearRunClaims());

/**
 * Ticket 20 row 115 — one line sent five times gives one reply.
 *
 * 16 September: Ninia's „კი" to ask 1783 arrived five times in six seconds.
 * Five runs started, five „გაიგზავნა" replies came back, and her answer was
 * stored five times. She tapped once as far as she knows.
 */
describe('one line sent five times', () => {
  it('starts one run and hands the other four the same one', () => {
    expect(claimRun('501', 15, 'კი', 'run-1')).toBeNull();

    for (const attempt of ['run-2', 'run-3', 'run-4', 'run-5']) {
      expect(claimRun('501', 15, 'კი', attempt)).toBe('run-1');
    }
  });

  it('ignores whitespace, because whitespace is not intent', () => {
    claimRun('501', 15, 'კი', 'run-1');

    expect(claimRun('501', 15, '  კი ', 'run-2')).toBe('run-1');
    expect(claimRun('501', 15, 'კი\n', 'run-3')).toBe('run-1');
  });
});

/**
 * The half that decides whether this is worth having. „კი" is the commonest
 * thing anybody types, and a rule wide enough to catch the bug can easily eat
 * a real answer.
 */
describe('what it must never swallow', () => {
  it('lets the same line through once the first run has finished', () => {
    // The honest distinction is not time, it is whether the first one has
    // answered. A person repeats themselves after reading a reply, never
    // before — that is exactly what a double submit is not.
    claimRun('501', 15, 'კი', 'run-1');
    releaseRun('501', 15, 'კი', 'run-1');

    expect(claimRun('501', 15, 'კი', 'run-2')).toBeNull();
  });

  it('lets a different message through while the first is still running', () => {
    claimRun('501', 15, 'კი', 'run-1');

    expect(claimRun('501', 15, 'არა', 'run-2')).toBeNull();
  });

  it('keeps each thread separate', () => {
    claimRun('501', 15, 'კი', 'run-1');

    expect(claimRun('501', 16, 'კი', 'run-2')).toBeNull();
  });

  it('keeps each person separate', () => {
    // Two people answering yes to their own questions at the same second is
    // an ordinary minute, not a duplicate.
    claimRun('501', 15, 'კი', 'run-1');

    expect(claimRun('502', 15, 'კი', 'run-2')).toBeNull();
  });

  it('a failed run releases its claim, so the retry goes through', () => {
    // The route releases in `finally`, failure path included. A claim that
    // survived a failed run would refuse the person's own retry of the
    // message that just failed them — the one moment repeating yourself is
    // certainly deliberate.
    claimRun('501', 15, 'იპოვე ნოტარიუსი', 'run-1');
    releaseRun('501', 15, 'იპოვე ნოტარიუსი', 'run-1');

    expect(claimRun('501', 15, 'იპოვე ნოტარიუსი', 'run-2')).toBeNull();
  });
});

describe('a release cannot free somebody else’s claim', () => {
  it('a late release from an overrun run leaves the newer claim standing', () => {
    // Without the run-id check: run-1 overruns, run-2 takes the claim after
    // it expires, run-1 finishes and deletes run-2's claim — and the next
    // duplicate walks straight in while run-2 is still going.
    claimRun('501', 15, 'კი', 'run-1');
    releaseRun('501', 15, 'კი', 'run-1');
    claimRun('501', 15, 'კი', 'run-2');

    releaseRun('501', 15, 'კი', 'run-1');

    expect(claimRun('501', 15, 'კი', 'run-3')).toBe('run-2');
  });
});

describe('a leaked claim expires', () => {
  afterEach(() => jest.useRealTimers());

  it('does not refuse the same line forever', () => {
    // Every claim is released when its run settles, so this should never
    // fire. It exists because the cost of being wrong is asymmetric: without
    // it, one leak refuses that exact message on that thread for the life of
    // the process, and the person retypes it and watches nothing happen.
    jest.useFakeTimers().setSystemTime(new Date('2026-09-16T22:00:00Z'));
    claimRun('501', 15, 'კი', 'run-1');

    jest.setSystemTime(new Date('2026-09-16T22:11:00Z'));

    expect(claimRun('501', 15, 'კი', 'run-2')).toBeNull();
  });

  it('does not expire while a long run is legitimately still going', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-09-16T22:00:00Z'));
    claimRun('501', 15, 'კი', 'run-1');

    // The route's own hard ceiling is well inside this.
    jest.setSystemTime(new Date('2026-09-16T22:05:00Z'));

    expect(claimRun('501', 15, 'კი', 'run-2')).toBe('run-1');
  });
});
