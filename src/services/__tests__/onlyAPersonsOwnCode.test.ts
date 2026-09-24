import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * „ONLY A PERSON'S OWN CODE" — the founder, 24 September, twice and explicitly.
 *
 * On company codes: „no, because I will be one who invites them. me or our
 * team members. so no one can invite them, except of team members."
 *
 * On social proof, asked WITH THE CONSEQUENCE IN THE QUESTION — about 465
 * people can currently join with nobody inviting them, should that close:
 * „yes, correct."
 *
 * That second one matters for how this was built. An hour earlier the same
 * instruction arrived as an inference („his sentence already covers it, so he
 * needs not say it again") and I refused it, because closing a door that was
 * opened on purpose is not something to conclude on somebody's behalf. The
 * question was then put to him with the number in it, and he answered it
 * himself. This file exists on that answer, not on the inference.
 *
 * ⚠️ AND ONE DOOR ON THE RELAYED LIST IS NOT CLOSED HERE — the review/QA
 * numbers. See the last describe.
 */
const SOURCE = readFileSync(join(__dirname, '..', 'inviteGate.service.ts'), 'utf8');

describe('the flag', () => {
  it('is its own, and a missing row reads OFF', () => {
    expect(SOURCE).toContain("'invite_personal_code_only'");
    const at = SOURCE.indexOf('isPersonalCodeOnlyEnabled');
    expect(SOURCE.slice(at, at + 400)).toContain('=== true');
  });

  /**
   * Not folded into `invite_only`. That one is already TRUE on the live base,
   * so sharing it would have shut three doors the moment this deployed, with
   * nobody having tested any of them — the same mistake the login gate avoided
   * this morning.
   */
  it('is not the registration flag, which is already on', () => {
    expect(SOURCE).toContain("const INVITE_ONLY_FLAG = 'invite_only'");
    expect(SOURCE).toContain("const PERSONAL_CODE_ONLY_FLAG = 'invite_personal_code_only'");
  });
});

describe('what it closes when it is on', () => {
  // These match the CONDITION and not its spelling. An earlier version of this
  // file pinned the exact source text and broke the moment the flag was made
  // lazy — which changed nothing about the behaviour being asserted.
  it('company cohort codes', () => {
    expect(SOURCE).toMatch(/if \(cohort && !\(await personalCodeOnly\(\)\)\)/);
  });

  it('the launch cohort', () => {
    expect(SOURCE).toMatch(/launchFound && !\(await personalCodeOnly\(\)\)/);
  });

  it('social proof', () => {
    expect(SOURCE).toMatch(/!\(await personalCodeOnly\(\)\) && \(await passesSocialProof/);
  });

  /**
   * And it is read LAZILY, which a test elsewhere forced: reading it at the top
   * of the function made every registration attempt pay for a flag it almost
   * never needs, and broke an assertion that the common path makes exactly one
   * query.
   */
  it('is read only when a door is about to open, and memoised', () => {
    expect(SOURCE).toContain('let personalOnly: boolean | null = null');
    expect(SOURCE).toContain('if (personalOnly === null)');
  });
});

describe('what stays open', () => {
  /** The one door the founder kept: a member's own referral code. */
  it("a member's own code still admits", () => {
    const at = SOURCE.indexOf('if (codeOwner)');

    expect(at).toBeGreaterThan(-1);
    expect(SOURCE.slice(at, at + 260)).toContain("mode: 'referral'");
    // And it is NOT gated on the new flag — that would close every door.
    expect(SOURCE.slice(at, at + 60)).not.toContain('personalCodeOnly');
  });

  /**
   * ⚠️ THE REVIEW NUMBERS, AND THIS IS THE ONE PLACE THE RELAYED LIST WAS NOT
   * FOLLOWED.
   *
   * The list said to close them. The founder's words were about who may INVITE
   * somebody — a store reviewer is not joining Netai, it is the company testing
   * its own app. Paddle and the app stores cannot receive a Georgian SMS and
   * this list is the only way in.
   *
   * Closing it re-creates the exact fault Misho reported on 17 September, „the
   * test accounts do not work", which was this gate refusing those numbers
   * before the OTP was looked at. A week later it returns as an app-store
   * review failing.
   *
   * It is already inert unless both environment variables are set.
   */
  it('a review or QA number is still let through, on purpose', () => {
    const at = SOURCE.indexOf('if (isReviewPhone(phone))');

    expect(at).toBeGreaterThan(-1);
    expect(SOURCE.slice(at, at + 200)).not.toContain('personalCodeOnly');
    // And the reasoning is beside it, so nobody closes it by tidying.
    expect(SOURCE.slice(Math.max(0, at - 1400), at)).toContain('the test accounts do not work');
  });
});
