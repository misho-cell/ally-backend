import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

/**
 * NOTHING HOLDS THE DOOR SHUT — ONLY THE HABIT OF REMEMBERING TO SHUT IT.
 *
 * `auth.middleware.ts` is tested from three angles: a user token passes, an
 * admin token on a user endpoint is refused with its machine reason, a user
 * token on an admin endpoint is refused. Every one of those tests calls the
 * middleware DIRECTLY. Not one of them asks whether any route has it mounted.
 *
 * That is the shape this codebase has produced a dozen times today — the piece
 * is tested from every angle and the wire that calls it is not — and here the
 * wire is the front door of the product.
 *
 * Audited today, and the good news first: all 20 routes in profile.routes.ts
 * carry `authenticateJwt` and `requireUserRole` individually, and the other
 * ten user-facing routers mount the pair once with `router.use`. There is no
 * hole today. What there is no protection against is the TWENTY-FIRST route —
 * a new `profileRouter.get(...)` written without the pair is unauthenticated,
 * and every test in this repository passes.
 *
 * `requireUserRole`'s own comment says what that costs: „an admin JWT left in
 * shared client storage silently acts as the admin's own account (empty
 * contacts, wrong wallet) — the 'search returns nothing after using the
 * configurator' class of bug."
 *
 * The same source-test pattern as `registryParity` and
 * `connectorCallsAreLogged`: weaker than driving a real request, and it is
 * what can be held without a server in the test run.
 */
const ROUTES_DIR = join(__dirname, '..');

function source(file: string): string {
  return readFileSync(join(ROUTES_DIR, file), 'utf8');
}

/**
 * Mounted once for the whole router. A file here that loses its `use` line
 * fails this test rather than quietly opening every route it carries.
 */
const GUARDED_AT_THE_ROUTER = [
  'admin.routes.ts',
  'billing.routes.ts',
  'chat.routes.ts',
  'contacts.routes.ts',
  'notifications.routes.ts',
  'privacy.routes.ts',
  'requests.routes.ts',
  'tasks.routes.ts',
  'threads.routes.ts',
  'updates.routes.ts',
];

/**
 * Deliberately NOT behind a JWT, each for a reason that is written down. A new
 * file added to this list is a decision somebody has to make on purpose, which
 * is the whole point of naming them.
 */
const AUTHENTICATED_ANOTHER_WAY: Record<string, string> = {
  'auth.routes.ts': 'registration, login and OTP — there is no token yet',
  'oauth.routes.ts': 'the OAuth flow itself, which issues the token',
  'oauthPages.ts': 'served HTML, no API routes',
  'mcp.routes.ts': 'no route declarations of its own',
  'roQuery.routes.ts': 'the x-ro-key header, rate limited, read-only SELECT',
  'webhooks.routes.ts': "the provider's signature on the raw body",
  'profile.routes.ts': 'guarded per route — held by its own test below',
};

const ROUTE_DECL = /Router\.(get|post|put|patch|delete)\(/g;

describe('every route file is either behind the router-level guard or named as an exception', () => {
  const files = readdirSync(ROUTES_DIR).filter((f) => f.endsWith('.ts') && !f.startsWith('.'));

  it('finds the route files at all', () => {
    // Without this, an empty directory listing would make everything below
    // pass by describing nothing.
    expect(files.length).toBeGreaterThan(10);
  });

  it('accounts for every one of them', () => {
    const known = new Set([...GUARDED_AT_THE_ROUTER, ...Object.keys(AUTHENTICATED_ANOTHER_WAY)]);
    const unaccounted = files.filter((f) => !known.has(f));

    // A NEW ROUTE FILE LANDS HERE. Either it mounts the guard and goes in the
    // first list, or it is public for a reason and goes in the second with
    // that reason written next to it.
    expect(unaccounted).toEqual([]);
  });

  it.each(GUARDED_AT_THE_ROUTER)('%s mounts authenticateJwt for the whole router', (file) => {
    expect(source(file)).toMatch(/Router\.use\(\s*authenticateJwt/);
  });

  /**
   * admin.routes WANTS an admin token, so it is excluded rather than silently
   * passing a check that does not apply. privacy.routes is excluded for a
   * reason nobody decided — see the test below, which is why it is named here
   * instead of being dropped from the list quietly.
   */
  const REFUSES_AN_ADMIN_TOKEN = GUARDED_AT_THE_ROUTER.filter(
    (f) => f !== 'admin.routes.ts' && f !== 'privacy.routes.ts',
  );

  it.each(REFUSES_AN_ADMIN_TOKEN)('%s also refuses an admin token on a user endpoint', (file) => {
    expect(source(file)).toMatch(/Router\.use\(\s*authenticateJwt,\s*requireUserRole/);
  });

  /**
   * THE ONE THIS TEST FOUND ON ITS FIRST RUN, PINNED AS IT IS RATHER THAN
   * QUIETLY EXCUSED.
   *
   * privacy.routes.ts mounts `authenticateJwt` and NOT `requireUserRole`. It
   * carries the data summary, the export, and `deleteMyAccount` — which its
   * own comment calls irreversible and rate-limits to ten a minute for that
   * reason.
   *
   * It is not a cross-account hole: an admin token acts on the ADMIN's own
   * account, never on somebody else's. What it means is that an admin JWT left
   * in shared client storage — the exact case `requireUserRole` was written
   * for — reaches the erasure endpoint, and the account it would erase is the
   * admin's. The file's comment says it is deliberately not behind
   * `requireSubscription`, because „the right to erasure cannot depend on
   * having paid"; it says nothing about the role, so the omission reads as
   * unconsidered rather than decided.
   *
   * NOT CHANGED HERE. Who may reach an irreversible endpoint is not a thing to
   * alter at ten at night on my own reading, and an admin flow I cannot see
   * from the source may depend on it. Filed; this test holds the state so the
   * answer, whichever way it goes, is a deliberate edit to this file.
   */
  it('privacy.routes.ts takes any token, including an admin one — filed, not fixed', () => {
    const src = source('privacy.routes.ts');

    expect(src).toMatch(/Router\.use\(\s*authenticateJwt\s*\)/);
    expect(src).not.toContain('requireUserRole');
  });

  it('admin.routes.ts requires the admin role, not merely a token', () => {
    expect(source('admin.routes.ts')).toMatch(
      /Router\.use\(\s*authenticateJwt,\s*requireAdminRole/,
    );
  });
});

/**
 * PROFILE IS THE ONE THAT GUARDS ITSELF ROUTE BY ROUTE, twenty times over, and
 * that is the file where forgetting once is invisible.
 */
describe('profile.routes.ts carries the pair on every single route', () => {
  const src = source('profile.routes.ts');

  it('has no router-level guard, which is why the rest of this matters', () => {
    expect(src).not.toMatch(/Router\.use\(\s*authenticateJwt/);
  });

  it('declares the twenty routes this was audited against', () => {
    // The control. If the regex ever stops matching, „every route is guarded"
    // would pass over an empty list.
    expect(src.match(ROUTE_DECL)?.length).toBeGreaterThanOrEqual(20);
  });

  it('puts authenticateJwt and requireUserRole on each of them', () => {
    const unguarded: string[] = [];
    for (const m of src.matchAll(/profileRouter\.(get|post|put|patch|delete)\(\s*'([^']+)'/g)) {
      // The middleware list runs from the path to the handler; 400 characters
      // is comfortably past the longest of them in this file today.
      const after = src.slice(m.index + m[0].length, m.index + m[0].length + 400);
      if (!after.includes('authenticateJwt') || !after.includes('requireUserRole')) {
        unguarded.push(`${m[1].toUpperCase()} ${m[2]}`);
      }
    }

    expect(unguarded).toEqual([]);
  });
});
