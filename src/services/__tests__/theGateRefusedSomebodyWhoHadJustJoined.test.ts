import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * THE LOGIN GATE REFUSED PEOPLE WHO HAD ALREADY JOINED, AND IT WAS ON FOR AN
 * HOUR WHILE IT DID.
 *
 * The tester, 24 September, an hour after the switch: three fictional seats
 * that had registered through the correct invited path and been granted their
 * free days came back REFUSED, because none had started a thread yet.
 *
 * The class is real and the live base names two people in it:
 *
 *     Andre (168735)              registered 14 July
 *     Nika Abramishvili (171408)  registered 9 September
 *
 * Both registered through Netai and never opened a conversation. **Both would
 * have been told they need an invitation to a product they had already
 * joined** — and the first person the founder invites is exactly this shape:
 * register, look around, come back tomorrow, locked out before typing
 * anything.
 *
 * ⚠️ THE CONDITION HAD BEEN WIDENED ONCE ALREADY THAT DAY, from „has a thread"
 * to „thread or push subscription", after a dry run found account 4511. That
 * widening was right and still missed this, because both signals asked **what
 * somebody had DONE**, and the question the gate actually needs is **whether
 * they belong here**. A new joiner has done nothing yet. That is not the same
 * as being a stranger.
 */
const SOURCE = readFileSync(join(__dirname, '..', 'auth.service.ts'), 'utf8');
const FRAGMENT_AT = SOURCE.indexOf('export function belongsToNetaiSql');
const FRAGMENT = SOURCE.slice(FRAGMENT_AT, SOURCE.indexOf('\n}', FRAGMENT_AT));
const LOOKUP_AT = SOURCE.indexOf(
  'const result = await query<{ id: number; belongs_to_netai: boolean }>',
);
const LOOKUP = SOURCE.slice(LOOKUP_AT, SOURCE.indexOf('if (!result.rowCount', LOOKUP_AT));

describe('what makes an account one of ours', () => {
  /**
   * THE SIGNAL THAT WAS MISSING. `registerUser` writes `hasAccessToAlly` as a
   * literal `true` on every path, and the 62,156 legacy accounts all carry
   * false — so in THIS direction the column separates the two products
   * cleanly, whatever else is wrong with it.
   */
  it('registering through Netai is enough on its own', () => {
    expect(FRAGMENT).toContain('nu."hasAccessToAlly" = true');
  });

  it('so is a thread', () => {
    expect(FRAGMENT).toContain('FROM threads t');
  });

  it('so is a push subscription', () => {
    expect(FRAGMENT).toContain('FROM push_subscriptions p');
  });

  /**
   * OR throughout, never AND. Requiring two would refuse 40 of the 45 people
   * who have used the product — they have threads and never turned
   * notifications on.
   */
  it('any one of the three admits', () => {
    expect(FRAGMENT.match(/OR EXISTS/g)).toHaveLength(2);
    expect(FRAGMENT).not.toContain('AND EXISTS');
  });
});

describe('⚠️ the column the gate must NOT key on', () => {
  /**
   * `hasAccessToAlly = false` matches 62,163 accounts that have never opened
   * Netai AND 35 who use it every day, Lika Ose with 321 threads among them.
   * It is safe as a reason to ADMIT and would be a disaster as a reason to
   * REFUSE — which is why it appears only inside an OR.
   */
  it('appears only as a reason to admit, never as the test', () => {
    const flagAt = FRAGMENT.indexOf('hasAccessToAlly');

    expect(flagAt).toBeGreaterThan(-1);
    expect(FRAGMENT.slice(0, flagAt)).toContain('EXISTS');
    expect(FRAGMENT).not.toMatch(/NOT[\s\S]{0,40}hasAccessToAlly/);
  });
});

describe('one definition, two callers', () => {
  /**
   * `completeLogin` asks it in the same round trip as the phone lookup; the
   * admin dry-run asks it of an account id. A checker carrying its own copy of
   * the rule agrees with itself whatever the real rule does.
   */
  it('the login lookup is built from the fragment and carries no copy', () => {
    expect(LOOKUP).toContain('belongsToNetaiSql(\'up."userId"\')');
    expect(LOOKUP).not.toContain('FROM push_subscriptions');
    expect(LOOKUP.match(/await query/g)).toHaveLength(1);
  });

  it('the dry run uses the same fragment', () => {
    expect(SOURCE).toContain("belongsToNetaiSql('$1::int')");
  });

  /** It builds SQL by interpolation, so what may be interpolated is listed. */
  it('only accepts the expressions on the allow-list', () => {
    expect(SOURCE).toContain("const ID_EXPRESSIONS = ['up.\"userId\"', '$1::int']");
    expect(FRAGMENT).toContain('unknown id expression');
  });
});

describe('the gate itself', () => {
  it('still refuses only when the flag is on', () => {
    const gate = SOURCE.slice(SOURCE.indexOf('if (!result.rows[0].belongs_to_netai)'));

    expect(gate.slice(0, 2600)).toContain('if (await isLoginInviteOnlyEnabled())');
  });

  /** A refused person should be able to tell what happened from the log line. */
  it('says what it refused them for', () => {
    expect(SOURCE).toContain('never registered through Netai and never used it');
  });
});
