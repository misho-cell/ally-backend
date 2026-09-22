/**
 * A BLOCKED REPLY HAS FIVE CONSEQUENCES AND NOTHING HELD ANY OF THEM.
 *
 * Sabotage, 22 September: `const replySafe = verdict.safe` replaced by `true`
 * — 3,735 tests passed. `moderateReply` itself is tested; the ONE line that
 * reads its answer was not, and neither was anything hanging off it.
 *
 * What that boolean decides, all five measured from production incidents:
 *
 *   1. the text the person sees        — the apology, not the blocked reply
 *   2. the BUTTONS under it            — run 38, thread 14792: „ვინ ხარ შენ?"
 *      was blocked, the apology appeared, and the eight goal buttons from the
 *      blocked reply were still under it. Pressing one would have answered a
 *      sentence just ruled unfit to show.
 *   3. the share text                  — a blocked reply's invite text was
 *      being handed out with the apology
 *   4. THE MONEY (row 76, this morning) — thread 20857, 21 September: a plain
 *      Georgian question blocked after 75 seconds, twenty tokens spent on an
 *      answer nobody read, and the owner was charged for it
 *   5. the log line naming the category
 *
 * WHY THIS IS A SOURCE TEST AND NOT A BEHAVIOUR ONE. The five live inside
 * `processChat`, spread over a hundred lines of the hottest path in the
 * product, and there is no harness here that drives it. The guard is CORRECT
 * today — this is coverage, not a fix — so extracting five consequences out of
 * the reply path of every single run, to test something that already works,
 * is a worse trade than a weaker test that costs nothing. The same pattern
 * `connectorCallsAreLogged` and `registryParity` already use here.
 *
 * It is weaker than behaviour and it is not nothing: each of the five fails if
 * its line goes. The extraction is worth doing the next time that path is
 * being opened for a real reason.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

const source = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');

describe('the moderation verdict is read, and everything downstream obeys it', () => {
  /** If this slice ever came back empty the rest would pass vacuously. */
  it('finds the gate at all', () => {
    expect(source).toContain('const verdict = await moderateReply(');
  });

  it('reads the verdict rather than assuming it', () => {
    expect(source).toContain('const replySafe = verdict.safe;');
  });

  it('1 — shows the apology instead of the blocked text', () => {
    expect(source).toContain('replySafe ? cleanedFinal : RUN_STRINGS[language].moderationBlocked');
  });

  it('2 — drops the buttons that belonged to the blocked reply', () => {
    expect(source).toContain('attachmentsAfterModeration(replySafe');
    expect(source).toContain('if (!replySafe) return { choices: null, options: undefined };');
  });

  it('3 — withholds the share text', () => {
    expect(source).toContain('const shareTextRaw = replySafe ? shareTextHeld : undefined;');
  });

  /**
   * ROW 76, AND THE ONE WITH A PRICE ON IT. „Nothing was lost" was not true
   * while we kept the money for an answer the owner never saw.
   */
  it('4 — does not charge for a reply the owner never saw', () => {
    expect(source).toContain('if (payerId !== null && !replySafe) {');
  });

  it('5 — names the category in the log, and never the blocked text', () => {
    expect(source).toContain("category=${verdict.reason ?? 'unnamed'}");
    // The content of a reply blocked for harassment is the last thing that
    // belongs in a log file. Length and category, never the words.
    expect(source).toContain('len=${cleanedFinal.length}');
  });
});
