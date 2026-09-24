import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * A REFUSAL TEST WHOSE FAILURE MODE IS „IT MADE AN ACCOUNT ANYWAY" IS NOT A
 * REFUSAL TEST.
 *
 * The tester, 24 September, on why they could not prove the refusal legs of
 * `invite_personal_code_only`:
 *
 *   „No code — NOT PROVABLE through the route. Netai Test 28, no invited_by →
 *   201, active pro, no inviter. We read that as the route's plain seat path
 *   skipping the registration gate, not as the gate letting a no-code person
 *   in — but we cannot tell those apart from here."
 *
 * Exactly right, and it is the distinction this whole month keeps turning on:
 * **a thing that never ran and a thing that ran and allowed look identical
 * from outside.** The seat route inserts an account; it does not register one.
 *
 * So `POST /admin/registration-gate-check` asks the gate directly and creates
 * nothing. These tests pin the two properties that make it worth trusting: it
 * asks the REAL gate, and it writes nothing.
 */
const ROUTES = readFileSync(join(__dirname, '..', 'admin.routes.ts'), 'utf8');
const HANDLER = ROUTES.slice(
  ROUTES.indexOf("'/registration-gate-check'"),
  ROUTES.indexOf("adminRouter.get('/test-accounts'"),
);

describe('it asks the real gate', () => {
  it('calls the product’s own eligibility check, not a copy of the rules', () => {
    expect(HANDLER).toContain('await checkRegistrationEligibility(phone, inviterPhone');
    expect(ROUTES).toContain("from '../../services/inviteGate.service'");
  });

  /** The three shapes the tester needs: a personal code, a cohort code, nothing. */
  it('takes an inviter and a code, and needs neither', () => {
    expect(HANDLER).toContain("body('invited_by').optional()");
    expect(HANDLER).toContain("body('referral_code').optional()");
  });

  /**
   * Unedited. The moment a route starts deciding what „eligible: false" means
   * before printing it, the thing under test is the route and not the gate.
   */
  it('returns the verdict as the gate gave it', () => {
    for (const field of ['gate.eligible', 'gate.mode', 'gate.reason', 'gate.inviterUserId']) {
      expect(HANDLER).toContain(field);
    }
  });
});

describe('it creates nobody', () => {
  it('writes nothing — no seat, no account, no phone row', () => {
    expect(HANDLER).not.toMatch(/createTestSeat/);
    expect(HANDLER).not.toMatch(/INSERT\s+INTO/i);
  });

  /** Said out loud in the response, so nobody has to take it on trust. */
  it('says so in what it returns', () => {
    expect(HANDLER).toContain("created: 'nothing'");
  });

  /**
   * The phone is the first FREE fictional slot — an unknown number nobody has
   * saved, which is the shape of the person the social-proof door exists for.
   * A caller-supplied phone would be a number nobody checked, and could be a
   * real person's.
   */
  it('uses a free fictional number and never one the caller names', () => {
    expect(HANDLER).toContain('await firstFreeFictionalPhone()');
    expect(HANDLER).not.toMatch(/body\('phone'\)/);
  });
});
