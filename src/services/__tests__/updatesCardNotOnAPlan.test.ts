import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Ticket 20 row 237 — the product's own updates card refused the owner's
 * typed approval.
 *
 * The seat, 21 September 23:25:56: a plan card went up with „I approve /
 * Change it", and in the same second, AFTER it, „8 more updates are waiting"
 * with „Show them / Later". „go ahead" at 23:26:24 was refused, because the
 * consent guard reads the newest card that offers buttons and asks whether it
 * is a plan's. Only the button's exact words got through, at 23:27:36.
 *
 * Held here as source assertions rather than by running a whole chat turn:
 * the behaviour is a decision taken at delivery inside a 9,000-line module
 * whose live path needs a model, a thread and a database. What can go wrong
 * silently is the WIRING — the flag set in the wrong place, the filter checked
 * where the model's ordering can beat it, the flag left behind after the run —
 * and each of those is visible in the text.
 */
const SOURCE = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
const code = SOURCE.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

describe('the count card is not dealt on top of an unanswered plan', () => {
  it('marks the run when a plan card actually goes on screen', () => {
    // Beside `planIsOnScreen = true`, which is the moment the card is stored.
    expect(code).toMatch(/planIsOnScreen = true;\s*notePlanIsOnScreen\(runId\);/);
  });

  it('filters at delivery, where the order of tool calls cannot beat it', () => {
    // get_pending_updates usually runs FIRST, so a check where the item is
    // noted would miss the plan proposed later in the same run.
    const take = code.slice(code.indexOf('function takePendingItems'));
    expect(take.slice(0, 400)).toContain('takePlanWentOnScreen(runId)');
    expect(take.slice(0, 400)).toContain("item.kind !== 'more_pending'");
  });

  it('forgets the flag when it is read, and again when the run is cleared', () => {
    const take = code.slice(code.indexOf('function takePlanWentOnScreen'));
    expect(take.slice(0, 300)).toContain('runProposedAPlan.delete(runId)');
    const clear = code.slice(code.indexOf('function clearRunState'));
    expect(clear.slice(0, 500)).toContain('runProposedAPlan.delete(runId)');
  });

  /**
   * The UPDATE ITEMS are deliberately NOT filtered, and this test says so out
   * loud so nobody "completes" the fix by copying the line. getPendingUpdates
   * has already released them from the queue by the time delivery runs, so a
   * dropped item is a lost item — the only copy.
   */
  it('drops only the count, never the items, which have nowhere to go back to', () => {
    const take = code.slice(
      code.indexOf('function takePendingItems'),
      code.indexOf('function takePendingItems') + 400,
    );
    const filters = take.match(/item\.kind !== '[a-z_]+'/g) ?? [];
    expect(filters).toEqual(["item.kind !== 'more_pending'"]);
  });
});
