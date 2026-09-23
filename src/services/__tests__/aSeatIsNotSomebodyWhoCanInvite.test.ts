import { readFileSync } from 'fs';
import { join } from 'path';

const scoring = readFileSync(join(__dirname, '..', 'targetScoring.service.ts'), 'utf8');
const fn = scoring.slice(
  scoring.indexOf('async function askableInviterIds'),
  scoring.indexOf('async function bestInviterForPhones'),
);
/**
 * THE SQL ALONE, because the comment above it NAMES the id range in order to
 * explain why the range must not be used — and a substring test over the whole
 * function reads that explanation as the mistake it warns about. The first
 * version of this test did exactly that and failed on its own reasoning.
 */
const sql = fn.slice(fn.indexOf('`SELECT'), fn.indexOf('`,'));

/**
 * FICTIONAL SEATS ARE NOT PEOPLE AND MUST NOT SIT IN A POOL OF PEOPLE WHO CAN
 * BE ASKED TO DO SOMETHING.
 *
 * Measured 23 September, hours after the seat-creation route shipped:
 *
 *     accounts, all                              62,227
 *       of them fictional seats                      20     nothing, 0.03%
 *     accounts with an ACTIVE subscription            41
 *       of them fictional seats                      20     ← 49%
 *     accounts in an invite cohort                     0
 *
 * The pollution was not spread thin. It sat entirely in „active", where it was
 * half, and it grew by one every time either of us made a seat. Nothing
 * reached a real person — a seat can only be the best inviter for somebody in
 * its own phonebook, and a seat's number is registered to nobody — but every
 * count and every ranking built on this pool was half fiction, and „41 active
 * users" is 21.
 */
describe('the pool of people who can be asked to invite somebody', () => {
  it('excludes the seats made by the route', () => {
    expect(sql).toContain('NOT EXISTS (SELECT 1 FROM test_seats ts WHERE ts.user_id = u.id)');
  });

  it('excludes the eleven that live in source', () => {
    expect(sql).toContain('u.id <> ALL($1::int[])');
    expect(fn).toContain('fictionalTestAccountIds()');
  });

  /**
   * AND IT USES NEITHER OF THE TWO THINGS THAT MERELY CORRELATE WITH BEING A
   * SEAT — THIS IS THE POINT OF THE TEST.
   *
   * I tried the id range first. „171870 to 171941" reads as the seats and
   * CONTAINS 171903: a real person's account, Georgian name, +995 number,
   * inside the range only because of when it was created. Filtering on the
   * range would have removed a real human being from this pool the day they
   * subscribed, silently — the 17 September shape, where an invisible
   * exclusion went unnoticed for three days.
   *
   * The phone prefix is the same kind of mistake wearing better clothes: every
   * seat is on +1202555, but „is on that range" is a property the data happens
   * to have, not a list anybody wrote.
   *
   * An id range is not a fact about a person. Neither is a name, and neither
   * is a phone prefix on its own.
   */
  it('does not guess from an id range or a phone prefix', () => {
    expect(sql).not.toMatch(/BETWEEN\s+1718/);
    expect(sql).not.toContain('171870');
    expect(sql).not.toContain('1202555');
    expect(sql).not.toContain('LIKE');
  });

  /** The gates that were already there are untouched. */
  it.each([
    ['deleted accounts', 'u."deletedAt" IS NULL'],
    ['an inactive subscription', "u.subscription_status = 'active'"],
    ['somebody who opted out', 'NOT EXISTS (SELECT 1 FROM ask_optouts ao WHERE ao.user_id = u.id)'],
  ])('still keeps out %s', (_name, clause) => {
    expect(sql).toContain(clause);
  });
});
