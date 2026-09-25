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

  /**
   * ⚠️ AND THE FIRST VERSION OF THIS COMPARED RAW TEXT, WHICH MISSED THE ONE
   * CASE A PERSON ACTUALLY SAW.
   *
   * Thread 24883: step at 15:50:17, message at 15:50:22, same run, same
   * relayed answer — „mid-October — could you" against „mid-October, could
   * you". An em-dash. Not equal, not contained, not caught, and I had already
   * told the tester it was „not my H shape" from their description without
   * reading the rows.
   *
   * Comparison is now on what was SAID: everything that is not a letter or a
   * digit is stripped from both sides first. Measured over fourteen days,
   * that takes the tidy from 32 to 42 and leaves 564 genuinely different
   * steps alone.
   */
  it('compares the words, not the typesetting', () => {
    expect(src).toContain("REGEXP_REPLACE(TRIM(${expr}), '[^[:alnum:]ა-ჿ]+', '', 'g')");
    expect(fn).toContain("${SAME_WORDS('content')} = ${SAME_WORDS('$3')}");
  });

  it('catches containment only when the step is long enough to mean something', () => {
    expect(fn).toContain("POSITION(${SAME_WORDS('content')} IN ${SAME_WORDS('$3')}) > 0");
    expect(src).toContain('const SAME_WORDS_LONG_ENOUGH = 60;');
  });

  /**
   * ⚠️ WHAT IT STILL DOES NOT CATCH, ON PURPOSE AND WITH THE NUMBERS.
   *
   * The tester's own 24883 case is NOT fixed by this. Its step is not merely
   * typeset differently — the model REWROTE a clause („that's" became „since
   * that's"), so the step's words are not inside the reply.
   *
   * Catching that needs a rule that deletes a step whose tail I cannot prove
   * the reply reproduces. Measured: 13 such pairs in fourteen days, and when I
   * read them they are plan cards where the step is sometimes LONGER than the
   * reply — two of the three I sampled were. Deleting those loses a line
   * nobody can get back.
   *
   * So the loss-free half shipped and the judgement call went to the tester
   * and the founder with these numbers, rather than being taken here.
   */
  it('does not delete a step whose words the reply does not contain', () => {
    expect(fn).not.toMatch(/LEFT\(/);
    expect(fn).not.toContain('similarity');
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
