import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * THE LOGIN GATE NOW KEYS ON ANY SIGN OF USE, AND IT TOOK A DRY RUN TO FIND OUT
 * THAT IT HAD TO.
 *
 * §34 said „has a thread" splits the population cleanly, and gave the check
 * behind that: an account with messages or goals but no thread — **zero, and
 * zero.** Both were true. Both are still true. **Push subscriptions were not
 * among the things checked.**
 *
 * Run as a read against every account on 24 September, before the gate was ever
 * switched on:
 *
 *     would be refused at their next login      62,173
 *       of those, has a goal                          0
 *       has a saved note                              0
 *       HAS A LIVE PUSH SUBSCRIPTION                  1
 *
 * That one is account 4511, an old Ally account from March 2024 with a push
 * subscription registered 21 September and two notifications sent to it. **A
 * push subscription cannot exist unless that browser was on the Netai site and
 * the person granted permission.** So the gate would have told somebody they
 * need an invitation to a product they already have on their phone.
 *
 * „Splits them cleanly" was a conclusion drawn from the two signals that had
 * been looked at, stated as though it covered all of them. That is the fault
 * this file exists to keep fixed.
 */
const SOURCE = readFileSync(join(__dirname, '..', 'auth.service.ts'), 'utf8');
// The end marker appears three times in this file and the first is far ABOVE
// the start — an unanchored indexOf gave an empty slice and four green-looking
// failures. It is searched from the start of the block, not from the file.
const LOOKUP_AT = SOURCE.indexOf(
  'const result = await query<{ id: number; has_used_netai: boolean }>',
);
const LOOKUP = SOURCE.slice(LOOKUP_AT, SOURCE.indexOf('if (!result.rowCount', LOOKUP_AT));

describe('what counts as having used Netai', () => {
  it('a thread still counts', () => {
    expect(LOOKUP).toContain('FROM threads t WHERE t.user_id = up."userId"');
  });

  it('so does a push subscription', () => {
    expect(LOOKUP).toContain('FROM push_subscriptions p');
  });

  /**
   * OR, not AND. The difference is the whole thing: AND would refuse everybody
   * who has a thread but never turned notifications on — which is 40 of the 45
   * people who have used the product.
   */
  it('either one is enough, and it is asked in one round trip', () => {
    expect(LOOKUP).toMatch(/EXISTS[\s\S]*threads[\s\S]*OR EXISTS[\s\S]*push_subscriptions/);
    expect(LOOKUP.match(/await query/g)).toHaveLength(1);
  });
});

describe('the direction it fails in', () => {
  /**
   * Widening admits one more person and refuses nobody extra. For a gate whose
   * whole job is turning people away, that is the only direction a change is
   * allowed to be wrong in — and it is why this did not wait for a decision.
   * If the founder decides 4511 should be refused after all, it comes back
   * out; that is somebody choosing, not a gap nobody saw.
   */
  it('the reasoning sits beside the query, so nobody narrows it by tidying', () => {
    expect(LOOKUP).toContain('ANY SIGN OF USE, NOT ONE SIGN');
    expect(LOOKUP).toContain('4511');
  });

  /** The gate itself is unchanged: still behind the flag, still off by default. */
  it('still only refuses when the flag is on', () => {
    const gate = SOURCE.slice(SOURCE.indexOf('if (!result.rows[0].has_used_netai)'));

    expect(gate.slice(0, 2600)).toContain('if (await isLoginInviteOnlyEnabled())');
  });
});
