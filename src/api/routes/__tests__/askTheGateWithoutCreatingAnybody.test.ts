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
  /**
   * ⚠️ THIS ASSERTION USED TO READ „never one the caller names", and that was
   * the rule until the social-proof door needed testing. A caller may now name
   * one — and ONLY one of the hundred slots in the block reserved worldwide for
   * fiction, checked by `isFictionalSlot`. The property being protected has not
   * moved: **a real person's number can never be asked about.** See the last
   * describe for the guard itself.
   */
  it('uses a free fictional number when the caller names none', () => {
    expect(HANDLER).toContain('firstFreeFictionalPhone()');
  });
});

describe('the one number a caller may name', () => {
  /**
   * ⚠️ EVERYWHERE ELSE THE RULE IS THAT THE CALLER CANNOT PASS A PHONE, because
   * a number handed in is a number nobody checked — Netai Test 5 sits on a
   * number a real owner had had in their phonebook since August.
   *
   * The rule holds here: only the hundred slots in the block reserved
   * worldwide for fiction are accepted. What it buys is the SOCIAL-PROOF door,
   * which cannot be reached any other way — that door is about a number OTHER
   * people already have saved, and the next free slot is saved by nobody.
   */
  it('accepts a fictional slot and refuses anything else', () => {
    expect(HANDLER).toContain('!isFictionalSlot(asked)');
    expect(HANDLER).toContain('a real number is never asked about');
  });

  it('still falls back to the next free slot when none is named', () => {
    expect(HANDLER).toContain('asked ?? (await firstFreeFictionalPhone())');
  });
});

describe('the code branch, reachable without anybody seeing a code', () => {
  /**
   * The tester, 24 September: „we could not repeat the code-branch pass — the
   * admin user read shows no referral code to type in."
   *
   * Correct, and it should stay that way: **a referral code is a credential**
   * (D149), and an admin page that printed them would print real people's
   * alongside the fictions'. So the caller names a SEAT and the server
   * resolves that seat's code — the branch gets exercised by somebody who
   * never sees a code.
   */
  it('takes a seat id and resolves the code server-side', () => {
    expect(HANDLER).toContain("body('invited_by_code').optional()");
    expect(HANDLER).toContain('await inviterSeatReferralCode(String(invited_by_code))');
  });

  /**
   * It is never echoed back, which is the whole point of resolving it here.
   *
   * Asserted against the RESOLVED variable and the caller's field, not against
   * the string „code" — the response does carry `cohort_code`, which is a mode
   * name and not a credential, and a blunter assertion would have failed on
   * that and taught somebody to loosen it.
   */
  it('never returns the code', () => {
    const response = HANDLER.slice(HANDLER.indexOf('res.status(200)'));

    expect(response).not.toMatch(/\bcode\b\s*[,}]/);
    expect(response).not.toContain('referral_code');
    expect(response).toContain("created: 'nothing'");
  });

  /** A caller-supplied code still works; this is an extra door, not a swap. */
  it('leaves the plain referral_code path alone', () => {
    expect(HANDLER).toContain('invited_by_code === undefined');
    expect(HANDLER).toContain('? referral_code');
  });
});
