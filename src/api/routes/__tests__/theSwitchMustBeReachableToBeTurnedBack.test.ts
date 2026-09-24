import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * THE TWO DOORS HAVE TO BE REACHABLE FROM THE DASHBOARD — 24 September.
 *
 * The founder's word came through the tester's box („turn all three on") and
 * Misho's came directly: all three, in order, with the tester's round between
 * each. Turning one on is a decision people make. **Turning one back off in a
 * hurry is what this file is about.**
 *
 * Both gate flags existed in the service and neither was on the route's
 * allow-list, so neither could be flipped by anybody without a deploy. For a
 * flag that REFUSES REAL PEOPLE ENTRY that is the wrong way round: the switch
 * that closes a door has to be reachable before the door closes, or the only
 * way out of a bad flip is a release.
 *
 * ⚠️ AND THE THING THIS FILE EXISTS TO STOP SOMEBODY ASSUMING: adding a flag
 * to the allow-list DOES NOT TURN IT ON. It does not even create its row, and a
 * missing row reads false. Reachable and on are different facts, and this month
 * has cost us four numbers that came from not asking which one was meant.
 */
const ROUTES = readFileSync(join(__dirname, '..', 'admin.routes.ts'), 'utf8');
const GATE = readFileSync(
  join(__dirname, '..', '..', '..', 'services', 'inviteGate.service.ts'),
  'utf8',
);
const ALLOW_LIST = ROUTES.slice(
  ROUTES.indexOf('const MANAGED_APP_FLAGS'),
  ROUTES.indexOf('const MANAGED_SETTINGS'),
);

describe('the allow-list', () => {
  it('carries both doors, by their constants and not by a typed string', () => {
    expect(ALLOW_LIST).toContain('PERSONAL_CODE_ONLY_FLAG');
    expect(ALLOW_LIST).toContain('LOGIN_INVITE_ONLY_FLAG');
  });

  /**
   * A flag named by a literal in two files is a flag that can be renamed in one
   * of them. The route and the gate have to be reading the same row or the
   * dashboard writes a switch nothing consults — which looks exactly like the
   * switch not working.
   */
  it('names the same rows the gate reads', () => {
    expect(GATE).toContain("export const LOGIN_INVITE_ONLY_FLAG = 'netai_invite_only_login'");
    expect(GATE).toContain("export const PERSONAL_CODE_ONLY_FLAG = 'invite_personal_code_only'");
    expect(ROUTES).toContain("from '../../services/inviteGate.service'");
  });

  /** The reason the list exists at all: a typo must not mint a new flag row. */
  it('is still an allow-list and the route still checks it', () => {
    expect(ROUTES).toContain('.isIn([...MANAGED_APP_FLAGS])');
    expect(ROUTES).toContain('unknown flag');
  });
});

describe('reachable is not the same as on', () => {
  /**
   * Both gates read `=== true`, so a row that does not exist — which is the
   * state of both on the live base — is OFF. Being on the allow-list changes
   * nothing about that: the route writes a row only when somebody calls it.
   */
  it('a missing row still reads OFF for both', () => {
    for (const fn of ['isPersonalCodeOnlyEnabled', 'isLoginInviteOnlyEnabled']) {
      const at = GATE.indexOf(fn);

      expect(at).toBeGreaterThan(-1);
      expect(GATE.slice(at, at + 400)).toContain('=== true');
    }
  });
});
