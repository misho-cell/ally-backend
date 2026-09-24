const dbQuery = jest.fn();
let loginGateOn = false;

jest.mock('../../db/postgres/client', () => ({
  __esModule: true,
  query: (...args: unknown[]) => dbQuery(...args),
}));
jest.mock('../inviteGate.service', () => ({
  __esModule: true,
  checkRegistrationEligibility: jest.fn(),
  isLoginInviteOnlyEnabled: () => Promise.resolve(loginGateOn),
}));
jest.mock('../phone', () => ({ __esModule: true, phoneDigits: (p: string) => p }));

import { readFileSync } from 'fs';
import { join } from 'path';
import { completeLogin } from '../auth.service';

/**
 * A GATE THAT REFUSES REAL PEOPLE ENTRY TO THE PRODUCT.
 *
 * Founder's rule, 24 September: „nobody, except people who are already on
 * netai, can join netai without invitation". `completeLogin` had no gate at
 * all — an old Ally account walked straight in, and that is how 35 of the 45
 * real users arrived.
 *
 * ⚠️ THE CONDITION IS THE WHOLE SAFETY OF IT, and the obvious one is a
 * disaster:
 *
 *     hasAccessToAlly = false, never opened Netai    62,163   the target
 *     hasAccessToAlly = false, USES NETAI TODAY          35   Lika, 321 threads
 *
 * That column is the ADMIN-LOGIN flag. A gate keyed on it refuses the second
 * most active person in the product at her next login and tells her she needs
 * an invitation to something she has used for weeks. The gate keys on having
 * NEVER OPENED NETAI — no thread, ever — and there is no account anywhere with
 * messages or goals but no thread, so the two groups separate cleanly.
 *
 * It ships OFF, and these tests are most of the reason it is allowed to exist.
 */
const JWT_BEFORE = process.env.JWT_SECRET;

beforeAll(() => {
  process.env.JWT_SECRET = 'test-secret';
});
afterAll(() => {
  process.env.JWT_SECRET = JWT_BEFORE;
});

function account(hasUsedNetai: boolean): void {
  dbQuery.mockImplementation((sql: string) => {
    const text = String(sql);
    if (text.includes('has_used_netai')) {
      return Promise.resolve({ rows: [{ id: 160584, has_used_netai: hasUsedNetai }], rowCount: 1 });
    }
    // consumePhoneVerification's read: a fresh, consumed verification.
    if (text.includes('phone_verifications') || text.includes('UPDATE'))
      return Promise.resolve({ rows: [{ id: 1 }], rowCount: 1 });
    return Promise.resolve({ rows: [], rowCount: 1 });
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  loginGateOn = false;
});

describe('with the gate OFF, which is how it ships', () => {
  it('lets in an account that has never opened Netai, exactly as before', async () => {
    account(false);

    const out = await completeLogin('+995555000001');

    expect(out.token).not.toBe('');
    expect(out.isNewUser).toBe(false);
  });
});

describe('with the gate ON', () => {
  it('refuses an account that has never opened Netai', async () => {
    loginGateOn = true;
    account(false);

    await expect(completeLogin('+995555000001')).rejects.toThrow(/მოწვევ/);
  });

  /**
   * THE ONE THAT MATTERS MOST. These 35 are live users and the gate must not
   * see them. If this test ever goes red, somebody has changed the condition
   * from „has never opened Netai" to something about the flag, and Lika is
   * locked out of the product.
   */
  it('NEVER refuses somebody who already uses Netai', async () => {
    loginGateOn = true;
    account(true);

    const out = await completeLogin('+995555000001');

    expect(out.token).not.toBe('');
  });

  /** The refusal says what would work. A person told only „no" tries again. */
  it('tells them an invitation is what is missing, not that something broke', async () => {
    loginGateOn = true;
    account(false);

    await expect(completeLogin('+995555000001')).rejects.toThrow(/Netai/);
    const message = await completeLogin('+995555000001').catch((e: Error) => e.message);
    expect(message).toContain('მოსაწვევი');
  });

  /** It refuses. It does not write. There is nothing to undo afterwards. */
  it('changes nothing in the database when it refuses', async () => {
    loginGateOn = true;
    account(false);

    await completeLogin('+995555000001').catch(() => undefined);

    const writes = dbQuery.mock.calls
      .map((c) => String(c[0]))
      .filter((sql) => /INSERT|UPDATE "User"|DELETE/.test(sql));
    // The only UPDATE on this path is consuming the phone verification, which
    // happens before the gate and is not the gate's doing.
    expect(writes.some((sql) => sql.includes('INSERT INTO "User"'))).toBe(false);
  });
});

describe('the switch is its own, and starts shut', () => {
  const gate = readFileSync(join(__dirname, '..', 'inviteGate.service.ts'), 'utf8');

  /**
   * NOT the registration flag. `invite_only` has been true on the live base
   * since 17 September — reusing it would have switched this on the moment it
   * deployed, at 62,163 people, untested.
   */
  it('uses a different flag from registration', () => {
    expect(gate).toContain("'netai_invite_only_login'");
    expect(gate).toContain("const INVITE_ONLY_FLAG = 'invite_only'");
  });

  it('reads a missing row as OFF', () => {
    const at = gate.indexOf('isLoginInviteOnlyEnabled');
    expect(gate.slice(at, at + 400)).toContain('=== true');
  });

  /** Registered before it was written, because it refuses people. */
  it('is in the write register with its off-switch', () => {
    const register = readFileSync(
      join(__dirname, '..', '..', '..', 'docs', 'ADMIN_WRITE_OPERATIONS.md'),
      'utf8',
    );

    expect(register).toContain('netai_invite_only_login');
    expect(register).toContain('DEFAULT OFF');
  });
});
