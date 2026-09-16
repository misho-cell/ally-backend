/**
 * Ticket 20 row 126 — every nudge written for the model is filtered from the
 * thread view, and none is filtered by being remembered.
 *
 * Ticket 5 item B1 is the reason this file exists. The cliffhanger nudge is a
 * `user` turn pushed into the run's history so the model reads it; it was
 * persisted as an ordinary message, rendered in the DOM as words the USER had
 * written, and the assistant answered it. The fix was one comparison against
 * one constant — which works exactly until somebody adds a second nudge.
 *
 * Row 126 added that second nudge. So the rule is asserted against the module
 * rather than against a list written out again here: any export whose name
 * ends in _NUDGE and which is pushed into history has to be in the set.
 */
import * as replyGuards from '../replyGuards';
import { MODEL_ONLY_NUDGES } from '../chat.service';

/**
 * The nudges replyGuards publishes. Read from the module so a new one is in
 * this test the moment it is written, with nobody having to remember.
 */
function exportedNudges(): [string, string][] {
  return Object.entries(replyGuards).filter(
    (entry): entry is [string, string] =>
      entry[0].endsWith('_NUDGE') && typeof entry[1] === 'string',
  );
}

describe('model-only nudges never reach the thread view', () => {
  it('finds the nudges at all — a test that silently checks nothing is worse than none', () => {
    const names = exportedNudges().map(([name]) => name);
    expect(names).toContain('CLIFFHANGER_NUDGE');
    expect(names).toContain('MISSING_PLAN_NUDGE');
  });

  it.each(exportedNudges())('%s is in MODEL_ONLY_NUDGES', (_name, text) => {
    expect(MODEL_ONLY_NUDGES.has(text)).toBe(true);
  });

  it('holds nothing else — the set is the filter, not a grab bag', () => {
    expect(MODEL_ONLY_NUDGES.size).toBe(exportedNudges().length);
  });

  it('an ordinary message is not filtered', () => {
    expect(MODEL_ONLY_NUDGES.has('კარგი, გააგრძელე')).toBe(false);
    expect(MODEL_ONLY_NUDGES.has('')).toBe(false);
  });
});
