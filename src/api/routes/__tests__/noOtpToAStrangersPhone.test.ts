import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * THE ONE LINE BETWEEN AN OPEN ENDPOINT AND TEXTING ANY NUMBER IN THE WORLD.
 *
 * Multi-line sabotage sweep, 22 September: the condition of
 * `if (!phone || (await findUserIdByPhone(phone)) === null)` on
 * `POST /oauth/authorize/send-code` replaced with `false` — the whole suite
 * passed.
 *
 * What that guard is holding. The route takes an unauthenticated POST with a
 * `phone` field and, past this check, calls `requestOTP(phone, 'AUTH')`, which
 * sends a real message to a real handset. The check is the only thing that
 * makes the number have to be OURS — somebody already registered. Without it,
 * anybody who can reach the endpoint can make Netai text an arbitrary number,
 * as often as they can vary it.
 *
 * `enforcePhoneSendCap` is NOT a substitute and it is worth saying why: it
 * caps five sends per PHONE per hour, so it stops the same stranger being
 * texted six times and does nothing at all about a list of ten thousand
 * different strangers being texted once each. The cap limits the nuisance to
 * one person; the guard is what limits it to our own users.
 *
 * WHY A SOURCE TEST. There is no HTTP harness in this suite — the route tests
 * here call exported functions. Standing an Express app up to hold one
 * condition is a bigger change than the condition, and the pattern this file
 * follows (`registryParity`, `connectorCallsAreLogged`) is the one the
 * codebase already uses for a wire it cannot otherwise reach. It is weaker
 * than a request and it fails the day the line goes.
 */
const oauth = readFileSync(join(__dirname, '..', 'oauth.routes.ts'), 'utf8');

const SEND_CODE = "oauthRouter.post('/authorize/send-code'";
const GUARD = 'if (!phone || (await findUserIdByPhone(phone)) === null) {';

describe('send-code will only text a number that is already ours', () => {
  it('finds the route and the guard at all', () => {
    // Without this, every assertion below would pass over a file that had been
    // restructured out from under it.
    expect(oauth).toContain(SEND_CODE);
    expect(oauth).toContain(GUARD);
  });

  /**
   * THE ORDER IS THE WHOLE GUARANTEE. A check that runs after the send is not
   * a check, and this is a handler long enough for the two to drift apart.
   */
  it('checks the number BEFORE anything is sent to it', () => {
    const routeAt = oauth.indexOf(SEND_CODE);
    const guardAt = oauth.indexOf(GUARD, routeAt);
    const sendAt = oauth.indexOf('await requestOTP(', routeAt);

    expect(guardAt).toBeGreaterThan(routeAt);
    expect(sendAt).toBeGreaterThan(guardAt);
  });

  /**
   * AND THE REFUSAL SAYS NOTHING IT SHOULD NOT. „This number is not registered"
   * is already an answer about somebody else's account, and it is the answer
   * the flow needs to be usable — but it must not carry a name, an id or a
   * status alongside it.
   */
  it('refuses without naming anything about the number', () => {
    const at = oauth.indexOf(GUARD);
    const block = oauth.slice(at, at + 500);

    expect(block).toContain('not registered with Ally');
    expect(block).not.toMatch(/userId|user_id|name:/);
  });

  /**
   * The send cap is not the guard, and a reader should not mistake it for one:
   * it is keyed on the phone, so it bounds how often ONE stranger is bothered
   * and not how many strangers there are. This asserts the guard exists
   * independently of it.
   */
  it('does not lean on the per-phone send cap, which counts the wrong thing', () => {
    const routeAt = oauth.indexOf(SEND_CODE);
    const nextRoute = oauth.indexOf('oauthRouter.post(', routeAt + 10);
    const handler = oauth.slice(routeAt, nextRoute > 0 ? nextRoute : undefined);

    expect(handler).toContain('findUserIdByPhone');
  });
});
