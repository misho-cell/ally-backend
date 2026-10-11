import { isPersonalCodeOnlyEnabled } from './inviteGate.service';
import { findCohortByCode } from './inviteCohorts.service';
import { findUserByReferralCode } from './referralCode.service';

/**
 * 2641 (§99.11, Misho's word: „a public route that answers only whether an
 * invite code exists"): the join page drew its welcome for any code in the
 * link, a made-up one included, and the person found out only at the end. It
 * now asks first. The answer is one bit — would this code be taken as an
 * invitation right now — never whose code it is, which cohort, or anything
 * else about it.
 *
 * The same doors as the registration gate: a member's own code always, a
 * company cohort code only while personal-codes-only is off.
 */
export async function inviteCodeExists(code: string): Promise<boolean> {
  if ((await findUserByReferralCode(code)) !== null) return true;
  if ((await findCohortByCode(code)) === null) return false;
  return !(await isPersonalCodeOnlyEnabled());
}
