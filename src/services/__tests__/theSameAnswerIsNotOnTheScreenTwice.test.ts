import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * ⚠️ ITEM H — THE SAME ANSWER POSTED TWICE, as a step and as a message.
 * The tester, 25 September, threads 24398, 24523 and 24534.
 *
 * The buried-answer rescue already deletes the step it promotes, which is why
 * this looked handled. But it fires only when the buried narration is LONGER
 * than the final, so the one case its arithmetic cannot see is the text being
 * THE SAME: equal length is not greater length, nothing is promoted, nothing
 * is deleted, and both rows reach the screen.
 *
 * MEASURED BEFORE WRITING THE FIX, over fourteen days on the live base:
 *
 *   32 runs, 26 threads   a step's text exactly equalled the final message
 *   20 of those runs      belonged to REAL PEOPLE — six of them
 *   12 more runs          step contained in the final but not equal
 *    3 of those 12        step at least 200 chars; shortest overall was NINE
 *
 * The nine-character one is why containment is guarded by a length: a stage
 * whisper turning up inside a sentence is coincidence, not repetition.
 *
 * ⚠️ WHAT THESE TESTS PROVE AND WHAT THEY DO NOT. `dropStepsTheReplyRepeats`
 * is module-private inside a file that cannot be stood up in a unit test, so
 * these are source assertions plus one thing they cannot give: the DELETE's
 * predicate was run as a SELECT against the real database before it shipped,
 * which is how the `updated_at` column that does not exist was caught on item
 * I an hour earlier. A green run of this file is not evidence that a duplicate
 * disappears in production; the tester's re-run is.
 */
const src = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');

const fn = src.slice(
  src.indexOf('async function dropStepsTheReplyRepeats'),
  src.indexOf('async function dropStepsTheReplyRepeats') + 2000,
);

describe('a step the reply already said is removed', () => {
  it('catches the exact repeat — the case the length comparison cannot see', () => {
    expect(fn).toContain('TRIM(content) = $3');
  });

  it('catches containment only when the step is long enough to mean something', () => {
    expect(fn).toContain('LENGTH(TRIM(content)) >= $4 AND POSITION(TRIM(content) IN $3) > 0');
    expect(src).toContain('const STEP_LONG_ENOUGH_TO_BE_A_REPEAT = 200;');
  });

  /** One run, one thread, steps only. Never a message, never another run's. */
  it('reaches nothing outside this run', () => {
    expect(fn).toContain('thread_id = $1 AND run_id = $2');
    expect(fn).toContain("kind = 'step'");
    expect(fn).toContain("role = 'assistant'");
  });

  it('does nothing without a run id, which would make the scope the whole thread', () => {
    expect(fn).toContain('if (!runId || text.length === 0) return;');
  });

  /**
   * The answer is already saved and already right. A tidy-up allowed to throw
   * would turn a cosmetic duplicate into a failed reply — strictly worse than
   * the bug. Same call as dropIntroCard's, for the same reason.
   */
  it('cannot break the reply it is tidying up after', () => {
    expect(fn).toContain('catch (error)');
    expect(fn).toContain('could not drop repeated steps');
  });

  /** House rule: every query carries a timeout. */
  it('has a timeout', () => {
    expect(fn).toContain('STEP_TIDY_TIMEOUT_MS');
    expect(src).toContain('const STEP_TIDY_TIMEOUT_MS = 5_000;');
  });
});

describe('it runs on the text the user actually got', () => {
  /**
   * After the save, and against `storedReply` — not `finalText`, which is
   * still several rewrites away from what is shown: the stage-direction drop,
   * the opener strip, the verbatim quote, the tool-name scrub and moderation
   * all come after it. Comparing a step to a string nobody was shown would
   * miss the duplicates it is here for.
   */
  it('compares against the stored reply, after it is written', () => {
    const save = src.indexOf("    storedReply,\n    'message',\n    runId,");
    const tidy = src.indexOf('await dropStepsTheReplyRepeats(threadId, runId, storedReply);');

    // ⚠️ Both anchors must be FOUND. A missing one is -1, and „tidy > -1" is
    // true for any tidy at all — an ordering test that passes because it could
    // not find the thing it was ordering.
    expect(save).toBeGreaterThan(0);
    expect(tidy).toBeGreaterThan(0);
    expect(tidy).toBeGreaterThan(save);
  });

  it('is not handed finalText instead', () => {
    expect(src).not.toContain('dropStepsTheReplyRepeats(threadId, runId, finalText)');
  });
});

/**
 * The rescue this sits beside is untouched, and must stay that way: it is what
 * stops an answer living only in a collapsed step, and it deletes its own
 * promoted row. Two mechanisms, one screen — this test is here so that
 * whoever simplifies one of them has to look at the other.
 */
describe('the buried-answer rescue still does its own tidying', () => {
  it('still deletes the step it promotes', () => {
    const rescue = src.slice(
      src.indexOf('const buriedAnswer ='),
      src.indexOf('// If the final is a short'),
    );

    expect(rescue.match(/await deleteMessage\(bestStepId\)/g)).toHaveLength(2);
  });
});
