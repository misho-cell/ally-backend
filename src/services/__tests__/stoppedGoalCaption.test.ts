import { readFileSync } from 'fs';
import { join } from 'path';
import { STOPPED_STATUS_LINE } from '../runLanguage';

/**
 * Row 207 — a goal its owner cancelled reads the same as one that succeeded.
 *
 * Both land on `done`, because `ThreadStatus` has one word for „this is over"
 * and the product needs two. The caption was meant to carry the difference.
 *
 * WHY IT DOES NOT. The seat read the user-facing list and reported three
 * captions on forty stopped goals. Their forty was mostly goals nobody ever
 * stopped — `closed_as IS NULL`, which the stage derivation calls „stopped"
 * because it refuses to claim a win on unknown data. The real number, on the
 * same account, is thirty-three of seventy — and every one of the thirty-seven
 * misses is dated 17 September.
 *
 * And the cause is not a second stop path: `goalStop` is the only writer of
 * `closed_as = 'stopped'`. It is that ANY later `setThreadStatus(..., 'done')`
 * which passes no line takes the `done` default, null in every language, and erases
 * the caption. The split is simply which threads were touched again.
 *
 * So the caption is derived at read time from the goal record, the same way
 * the status above it already is, and for the same stated reason: it fixes
 * every existing thread at once and writes across nobody's live data.
 */
const SOURCE = readFileSync(join(__dirname, '..', 'threads.service.ts'), 'utf8');

describe('the caption under a stopped goal', () => {
  it('is decided by the goal record, not by what the thread remembers', () => {
    const flag = SOURCE.slice(
      SOURCE.indexOf('const GOAL_WAS_STOPPED'),
      SOURCE.indexOf('const GOAL_IS_FINISHED'),
    );
    expect(flag).toContain("k.status = 'closed'");
    expect(flag).toContain("k.closed_as = 'stopped'");
  });

  it('never overwrites a caption the thread still has', () => {
    // A thread that kept its own says whatever it was given, in whatever
    // language it was given in. Only the empty ones are filled.
    const fill = SOURCE.slice(
      SOURCE.indexOf('async function withStoppedCaption'),
      SOURCE.indexOf('async function withStoppedCaption') + 1200,
    );
    expect(fill).toContain('r.status_line === null');
  });

  it('reads the language once for the whole list, not once per thread', () => {
    const fill = SOURCE.slice(
      SOURCE.indexOf('async function withStoppedCaption'),
      SOURCE.indexOf('async function withStoppedCaption') + 1200,
    );
    // The early return is what makes that true: a list with nothing to fill
    // asks nothing at all.
    expect(fill).toContain('if (!needsOne) return rows;');
    expect(fill).toContain('await userLanguage(userId)');
  });

  it('has the caption in every language, and it is the one the writer uses', () => {
    for (const language of ['ka', 'en', 'ru', 'es'] as const) {
      expect(STOPPED_STATUS_LINE[language].length).toBeGreaterThan(3);
    }
    for (const language of ['en', 'ru', 'es'] as const) {
      expect(STOPPED_STATUS_LINE[language]).not.toMatch(/[Ⴀ-ჿ]/);
    }
    // One table, both sides: goalStop writes from it and the reader supplies
    // from it, so a stopped thread cannot say two different words.
    const stopSource = readFileSync(join(__dirname, '..', 'goalStop.service.ts'), 'utf8');
    expect(stopSource).toContain('STOPPED_STATUS_LINE[language]');
  });
});
