import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * ⚠️ `ro.sh`'s POPULATION GUARD HAS NOW GONE SILENT ON THE WRONG QUERY TWICE,
 * and both times for the same reason: it accepted a NEARBY thought as evidence
 * that the asker had had the RIGHT one.
 *
 *   22:05, 23 Sep — naming `hasAccessToAlly` bought silence. That column is
 *                   the admin-login flag, which `registerUser` also sets for
 *                   every Netai registrant. Naming it was the moment to warn,
 *                   not to relax.
 *   26 Sep        — naming `test_seats` bought silence. Excluding the seats
 *                   settles ONE of three populations. I ran seven real people
 *                   with seats excluded, and six had never opened Netai; two
 *                   registered in 2024. That answer went to two teams.
 *
 * `User` holds three populations. A query that separates one of them has not
 * separated the others, and the guard must stop treating that as enough.
 *
 * This is a test and not a comment because the file it guards is a shell
 * script that nothing else typechecks, and because the quiet branch is the
 * one that costs something — a guard that has been silenced is invisible
 * exactly when it matters.
 */
describe('the population guard does not go quiet for the wrong reason', () => {
  const guard = readFileSync(join(__dirname, '..', '..', '..', 'scripts', 'ops', 'ro.sh'), 'utf8');

  /** Excluding the seats no longer buys silence on its own. */
  it('still warns when only the seats are excluded', () => {
    expect(guard).toContain('*threads*|*search_activity*|*subscription_status*) ;;');
    expect(guard).not.toMatch(/\*test_seats\*\)\s*;;/);
  });

  /**
   * The three ways a query can name USE are `joinedNetai()`'s own rule in
   * netaiMembership.ts. If that rule ever gains or loses a clause, this guard
   * has to move with it — two readings of one fact drifting apart is this
   * codebase's named recurring bug.
   */
  it('accepts exactly the evidence joinedNetai accepts', () => {
    const membership = readFileSync(join(__dirname, '..', 'netaiMembership.ts'), 'utf8');
    const joined = membership.slice(membership.indexOf('export function joinedNetai'));
    for (const evidence of ['threads', 'search_activity', 'subscription_status']) {
      expect(joined).toContain(evidence);
      expect(guard).toContain(evidence);
    }
  });

  /** The older lesson stays: naming the admin flag is a reason to warn. */
  it('still warns when hasAccessToAlly is named', () => {
    expect(guard).toContain('*hasAccessToAlly*)');
    expect(guard).toContain('ADMIN-LOGIN flag');
  });

  /** A note is only useful before the number arrives. */
  it('prints to stderr, so the definition precedes the answer', () => {
    const note = guard.slice(guard.indexOf('the seats are excluded'));
    expect(note.slice(0, 900)).toContain('>&2');
  });
});
