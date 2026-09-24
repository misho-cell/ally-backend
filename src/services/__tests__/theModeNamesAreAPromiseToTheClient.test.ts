import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * `mode` IS A CONTRACT WITH THE APP, NOT AN INTERNAL LABEL.
 *
 * `POST /auth/registration-eligibility` returns it to an unauthenticated
 * browser, and on 24 September the app team started keying behaviour on it:
 * their registration screen drops the word „optional" from „who invited you?"
 * when it meets a mode **this build does not know**.
 *
 * Their reasoning, and it is better than the alternative I offered: „optional"
 * is a promise about what the NEXT screen will accept. The door's rules changed
 * three times that day — company codes, cohorts and social proof closed, the
 * login gate on, off and on again — so an unknown answer should say LESS rather
 * than inherit a promise made under the old rule.
 *
 * ⚠️ WHICH MEANS RENAMING ONE OF THESE IS A CLIENT-VISIBLE CHANGE. A rename
 * that looks like tidying here turns every affected registration into „unknown
 * mode" on somebody's phone. They asked to be told; this test is so that
 * somebody has to notice before they can be told.
 *
 * Removing a mode is the same kind of change and needs the same message.
 */
const TYPES = readFileSync(join(__dirname, '..', '..', 'types', 'index.ts'), 'utf8');

describe('the modes the client is allowed to rely on', () => {
  it('are exactly these five, in the union the route returns', () => {
    expect(TYPES).toContain(
      "export type EligibilityMode = 'open' | 'existing' | 'social' | 'referral' | 'cohort';",
    );
  });

  /**
   * The two that can come back WITHOUT an inviter while the gate is on, which
   * is the pair the „optional" field depends on:
   *
   *   open      a review/QA number — nobody invited them and nobody can
   *   existing  the number is already registered
   *
   * The other three always carry an inviter or a code.
   */
  it('name the two that can arrive with no inviter', () => {
    for (const mode of ["'open'", "'existing'"]) {
      expect(TYPES).toContain(mode);
    }
  });
});
