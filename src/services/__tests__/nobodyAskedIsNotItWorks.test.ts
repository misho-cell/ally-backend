import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * „CAN A PERSON WITHOUT WHATSAPP GET IN RIGHT NOW?" — asked out loud, because
 * on 25 September nobody was asking and a real stranger answered it for us.
 *
 * The founder's first real invitation went by SMS to somebody with no
 * WhatsApp. He pressed „didn't get the code — send via SMS" and read the
 * provider saying our sending account is not active. He did not get in.
 *
 * THERE WAS NOTHING TO FIND. Not a log line, not a row. `usage_events` writes
 * `otp_sms` only AFTER a send succeeds, so a total outage and a quiet
 * afternoon left identical evidence — the same shape as `push_deliveries`
 * reporting `failed = 0` for endpoints that had stopped existing, and as
 * `ok = false` meaning both a refusal and a fault.
 *
 * `twilio.service.ts` writes the line now. `sms.sh` is the thing that reads
 * it, because a log nobody greps is a log nobody has.
 */
const sms = readFileSync(join(__dirname, '..', '..', '..', 'scripts', 'ops', 'sms.sh'), 'utf8');

describe('the four answers, because three would hide the one that matters', () => {
  /**
   * Registrations run at one or two a day, so MOST windows contain no SMS at
   * all. A script that called an empty window „sending" would be reassuring on
   * exactly the evidence that says nothing — which is the sentence this
   * codebase has had to unlearn about zero traffic, zero push failures, and
   * zero registrations, three times in one week.
   */
  it('separates nobody-asked from nothing-failed', () => {
    const header = sms.slice(0, sms.indexOf('set -uo pipefail'));

    expect(header).toMatch(/0\s+SENDING/);
    expect(header).toMatch(/1\s+REFUSED/);
    expect(header).toMatch(/2\s+COULD NOT LOOK/);
    expect(header).toMatch(/3\s+NOBODY ASKED/);
    expect(sms).toContain('raise SystemExit(3)');
  });

  it('says in the output itself that an empty window is not good news', () => {
    expect(sms).toContain('This is NOT „SMS works');
  });

  /**
   * Two sources, because neither alone can tell the two apart: successes come
   * from `usage_events`, refusals from the container log. Zero of both is the
   * third answer.
   */
  it('counts successes and refusals from different places', () => {
    expect(sms).toContain("kind = 'otp_sms'");
    expect(sms).toContain('PROVIDER REFUSED');
  });
});

describe('what it refuses to conclude', () => {
  it('never reads a failed read as a healthy channel', () => {
    const couldNotLook = sms.match(/COULD NOT LOOK/g) ?? [];

    expect(couldNotLook.length).toBeGreaterThanOrEqual(3);
    expect(sms).toContain('raise SystemExit(2)');
  });

  /**
   * An old deployment's log is somebody else's history, and reading it as
   * „now" is the fault errors.sh's header is mostly about. Only a SUCCESS
   * deployment is read, and a missing one is answer 2, not answer 0.
   */
  it('reads the live container and not whichever one came back first', () => {
    expect(sms).toContain('$2 == "SUCCESS"');
    expect(sms).toContain('no SUCCESS deployment came back');
  });
});

describe('what it says when the provider is refusing', () => {
  /**
   * The provider's own code is what separates „our account is not active",
   * which is billing and somebody else's to settle, from „that number is
   * unreachable", which is one person. So the lines are printed, not counted.
   */
  it('prints the provider’s own lines rather than a count of them', () => {
    expect(sms).toContain('for line in refused[-10:]');
  });

  /** The first question the tester asked, answered before it is asked again. */
  it('says that WhatsApp is a different provider and is unaffected', () => {
    expect(sms).toContain('WhatsApp is a');
    expect(sms).toContain('Meta Cloud API');
  });

  /** Money and accounts are named here and settled by somebody else. */
  it('names the account as the founder’s or Misho’s, and buys nothing', () => {
    expect(sms).toContain('BILLING OR SUSPENSION');
    expect(sms).toContain('do not buy anything');
  });
});
