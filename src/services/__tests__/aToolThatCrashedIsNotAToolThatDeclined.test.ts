import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * THE FIX I SHIPPED TONIGHT MADE A FAILURE QUIETER, AND NOTHING WAS WATCHING
 * FOR QUIET.
 *
 * Until this evening a tool that THREW ended the run: `processToolBlocks` runs
 * a turn's calls in a bare `Promise.all` with no catch, so one bad argument
 * rejected the whole turn and the person got a salvage artifact. That was the
 * bug. Misho approved the fix and the fix is right.
 *
 * ⚠️ BUT LOOK WHAT IT DID TO THE WATCHING. Before it, such a failure reached a
 * person, so `outage.sh` — every fifteen minutes — counted an error. After it,
 * the model gets a tool result, retries or apologises, and THE RUN COMPLETES.
 * `outage.sh` now sees a healthy window. I made the loud thing quiet on
 * purpose and did not notice, in the moment, that quiet was the only thing
 * nobody was asking about.
 *
 * What was left was `why.sh --new`, which catches a reason said for the FIRST
 * time, once a day. A thrown tool that REPEATS — the same exception every
 * morning on twenty runs — is new exactly once and then invisible forever.
 *
 * `threw.sh` is the question nobody was asking afterwards. What this file
 * holds is the distinction it exists to make, because collapsing it is the
 * easy mistake and this codebase has already made it once.
 */
const SCRIPT = readFileSync(
  join(__dirname, '..', '..', '..', 'scripts', 'ops', 'threw.sh'),
  'utf8',
);

describe('a tool that crashed is not a tool that declined', () => {
  /**
   * THE SIGNATURE IS EXACT, AND IT HAS TO BE. `result_keys` is a comma-joined
   * sorted list of the result's keys, and the throw path writes
   * `{ failed, error }` — so `error,failed` and nothing else.
   *
   * Measured against three days of live rows before this was written: the
   * REFUSALS carry `error,reason,sent`, `approved,error`, `error`,
   * `error,proposed`. A `LIKE '%error%'` here would have swept every one of
   * them into a count about crashes — which is exactly the reading that made
   * `slow.sh` call 122 correct refusals „failed" on 25 September.
   */
  it('matches the throw path exactly, not anything carrying an error key', () => {
    expect(SCRIPT).toContain("result_keys = 'error,failed'");
    expect(SCRIPT).not.toContain('LIKE ');
  });

  it('counts only rows the server marked not ok', () => {
    expect(SCRIPT).toContain('ok = false');
  });

  /**
   * „I could not look" is never reported as „nothing is wrong" — the rule every
   * script in this directory is built on, and the one that cost fifty minutes
   * on 22 September when it was missing.
   */
  it('keeps could-not-look separate from nothing-happened', () => {
    expect(SCRIPT).toContain('COULD NOT LOOK');
    expect(SCRIPT).toContain('sys.exit(2)');
    expect(SCRIPT).toContain('sys.exit(1)');
    expect(SCRIPT).toContain('sys.exit(0)');
  });

  /**
   * And it says so in the output rather than leaving a reader to assume that
   * „nothing threw" means „everything worked". Those are different sentences
   * and only one of them is true.
   */
  it('says plainly that silence here is not "every tool worked"', () => {
    expect(SCRIPT).toContain('is not the same as');
    expect(SCRIPT).toContain('why.sh, not this');
  });

  /**
   * The reader has to be told what a crash now looks like FROM OUTSIDE, since
   * the whole point of tonight's change is that it no longer looks like
   * anything: no error, no dead run — a step that silently did not happen.
   */
  it('explains that nobody necessarily saw an error', () => {
    expect(SCRIPT).toContain('the run did NOT die');
    expect(SCRIPT).toContain('silently');
  });

  /** Written down where the next person will be standing. */
  it('records that the fix is what created the blind spot', () => {
    expect(SCRIPT).toContain('AND IT IS MY OWN DOING');
    expect(SCRIPT).toContain('fifteen-minute signal for a one-day signal');
  });
});
