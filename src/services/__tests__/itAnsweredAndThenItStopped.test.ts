import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * ⚠️ `outage.sh` SAID „OK" THROUGH A TOTAL OUTAGE FOR TWENTY MINUTES.
 *
 * 28 September, 02:34:01. The provider began refusing every request — „You
 * have reached your specified API usage limits." Not one call reached
 * inference afterwards; twenty-seven goal wakes died; four people, at least
 * one of them a real person and not a seat, got „that step could not be
 * finished" written into their thread.
 *
 * And the monitor answered `0 — OK — errors are present but the product is
 * answering (4 reply(ies))`, twice, nineteen minutes apart.
 *
 * WHY IT LIED, AND IT IS THE DAY'S OWN FAULT ONE MORE TIME. The twenty-minute
 * window still contained four replies written at 02:34:03 — by runs that had
 * ALREADY received their model output before the limit bit. The test was „does
 * this window hold any reply at all", and the answer was yes. The count was
 * right and the question was wrong.
 *
 * The question is not whether the window holds a reply. It is whether anything
 * has succeeded SINCE the errors began. Twenty-seven errors, every one of them
 * newer than the newest reply, is not a product that is answering. It is a
 * product that answered and then stopped — which is the only shape an outage
 * has while it is starting, and therefore the only shape worth catching.
 *
 * It was found by reading the error rows because the exit code was not
 * believable. That is luck, not method, and this branch is what replaces it.
 *
 * THIS IS A SOURCE TEST AND I WOULD RATHER IT WERE NOT. The script's numbers
 * come from `ro.sh`, a read-only window on the LIVE database enforced by the
 * server — there is no seam to point at a fixture, and inventing one would put
 * a test-only door in an operational script. What it holds is that the
 * comparison exists, that it is a comparison of TIMES and not of counts, and
 * that the cheerful line below it can no longer be reached while the newest
 * thing in the window is an error.
 */
const SCRIPT = readFileSync(
  join(__dirname, '..', '..', '..', 'scripts', 'ops', 'outage.sh'),
  'utf8',
);

describe('it answered, and then it stopped', () => {
  /**
   * The three timestamps have to be SELECTED before anything can compare them.
   * Seconds since the epoch, so the comparison is integer arithmetic in bash
   * rather than timestamp parsing — a format difference is a silent wrong
   * answer, and this is a script whose whole job is not to give one.
   */
  it('asks the database WHEN, not only HOW MANY', () => {
    expect(SCRIPT).toContain('AS last_error');
    expect(SCRIPT).toContain('AS last_reply');
    expect(SCRIPT).toContain('AS last_call');
    expect(SCRIPT).toContain('EXTRACT(EPOCH FROM MAX(created_at))::bigint');
  });

  it('reads all three into the shell', () => {
    expect(SCRIPT).toContain('read -r ERRORS REPLIES CALLS OTHER LAST_ERROR LAST_REPLY LAST_CALL');
  });

  /** The branch itself: errors, and nothing newer than them. */
  it('calls it an outage when every error is newer than the newest reply', () => {
    expect(SCRIPT).toContain('[ "$ERRORS" -ge 3 ] && [ "$LAST_ERROR" -gt "$LAST_REPLY" ]');
    expect(SCRIPT).toContain('NOT ANSWERING ANY MORE');
  });

  /**
   * ⚠️ AND IT MUST COME BEFORE THE CHEERFUL LINE. If the „the product is
   * answering" branch is reached first, nothing below it runs and the fix is
   * decoration — which is exactly what the old file was, in the only twenty
   * minutes that mattered.
   */
  it('decides that before it decides the product is answering', () => {
    const stopped = SCRIPT.indexOf('NOT ANSWERING ANY MORE');
    const cheerful = SCRIPT.indexOf('OK — errors are present but the product is answering');

    expect(stopped).toBeGreaterThan(-1);
    expect(cheerful).toBeGreaterThan(stopped);
  });

  /**
   * „I could not look" is never „nothing is wrong": the fallback line that
   * feeds the shell when the read fails has to carry the two new fields too,
   * or `read` silently leaves them empty and every comparison becomes a
   * comparison against nothing.
   */
  it('keeps the could-not-look fallback the same width as the row', () => {
    expect(SCRIPT).toContain('print("x x x x x x x")');
  });

  /**
   * The two halves of the diagnosis stay apart, because they belong to
   * different people: nothing reaching the provider at all is an account or a
   * key, and that is Misho's or the founder's. A call that DID get through
   * after the last error means it is not refusing everything.
   */
  it('separates "nothing reached the provider" from "some calls did"', () => {
    expect(SCRIPT).toContain('[ "$LAST_CALL" -gt "$LAST_ERROR" ]');
    expect(SCRIPT).toContain('Nothing has reached inference since the errors began');
    expect(SCRIPT).toContain('account or key problem and not load');
  });

  /** Written where the next person will be standing. */
  it('records that the monitor itself said OK through the outage', () => {
    expect(SCRIPT).toContain('SAID „OK" THROUGH A TOTAL OUTAGE');
    expect(SCRIPT).toContain('The count was right and the question was wrong');
  });
});
