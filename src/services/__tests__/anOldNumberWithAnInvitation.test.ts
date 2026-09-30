const dbQuery = jest.fn();
const eligibility = jest.fn();
const grant = jest.fn();

jest.mock('../../db/postgres/client', () => ({
  __esModule: true,
  query: (...args: unknown[]) => dbQuery(...args),
}));
jest.mock('../inviteGate.service', () => ({
  __esModule: true,
  checkRegistrationEligibility: (...args: unknown[]) => eligibility(...args),
  isLoginInviteOnlyEnabled: () => Promise.resolve(true),
}));
jest.mock('../inviteCohorts.service', () => ({
  __esModule: true,
  ...jest.requireActual('../inviteCohorts.service'),
  grantCohortTrial: (...args: unknown[]) => grant(...args),
}));
jest.mock('../inviteReward.service', () => ({
  __esModule: true,
  inviteFreeDays: () => Promise.resolve(20),
  inviteFreeDaysCohort: (days: number) => ({
    code: `INVITE${days}`,
    tier: 'pro',
    trial_days: days,
  }),
}));

import { completeLogin, InvitationRequiredError } from '../auth.service';

/**
 * Row 319, Misho 30 Sep: an old Ally number that arrives with a member's
 * invitation gets in, credited to that member, with the twenty free days —
 * and one without an invitation is refused WITHOUT losing its login code.
 */
const OLD_ACCOUNT = 160584;
const INVITER = 501;
const JWT_BEFORE = process.env.JWT_SECRET;

let deletes = 0;
let inviteCohort: string | null = null;

function anOldAllyAccount(): void {
  dbQuery.mockImplementation((sql: string) => {
    const text = String(sql);
    if (text.includes('belongs_to_netai'))
      return Promise.resolve({ rows: [{ id: OLD_ACCOUNT, belongs_to_netai: false }], rowCount: 1 });
    if (text.includes('SELECT 1 FROM phone_verifications'))
      return Promise.resolve({ rows: [{ one: 1 }], rowCount: 1 });
    if (text.includes('DELETE FROM phone_verifications')) {
      deletes += 1;
      return Promise.resolve({ rows: [], rowCount: 1 });
    }
    if (text.includes('"inviterReferralUserId" = COALESCE'))
      return Promise.resolve({ rows: [{ invite_cohort: inviteCohort }], rowCount: 1 });
    return Promise.resolve({ rows: [], rowCount: 0 });
  });
}

beforeAll(() => {
  process.env.JWT_SECRET = 'test-secret';
});
afterAll(() => {
  process.env.JWT_SECRET = JWT_BEFORE;
});
beforeEach(() => {
  jest.clearAllMocks();
  deletes = 0;
  inviteCohort = null;
  anOldAllyAccount();
});

describe('an old Ally number arriving with an invitation', () => {
  it('is refused without one, with a code the app can act on, and keeps its login code', async () => {
    const attempt = completeLogin('+995555000001');
    await expect(attempt).rejects.toBeInstanceOf(InvitationRequiredError);
    await expect(completeLogin('+995555000001')).rejects.toMatchObject({
      code: 'invitation_required',
    });
    expect(deletes).toBe(0);
    expect(eligibility).not.toHaveBeenCalled();
  });

  it("gets in on a member's code, credited to that member, with the free days", async () => {
    eligibility.mockResolvedValue({ eligible: true, mode: 'referral', inviterUserId: INVITER });

    const out = await completeLogin('+995555000001', { referralCode: 'TORNIKE20' });

    expect(out.token).not.toBe('');
    expect(eligibility).toHaveBeenCalledWith('+995555000001', undefined, 'TORNIKE20');
    const credit = dbQuery.mock.calls.find(([sql]) => String(sql).includes('COALESCE'));
    expect(credit?.[1]).toEqual([OLD_ACCOUNT, INVITER]);
    expect(credit?.[2]).toBeGreaterThan(0);
    expect(grant).toHaveBeenCalledTimes(1);
    expect(grant.mock.calls[0][2]).toEqual(expect.objectContaining({ trial_days: 20 }));
    expect(deletes).toBe(1);
  });

  it('does not grant the days a second time on a later login through the same link', async () => {
    eligibility.mockResolvedValue({ eligible: true, mode: 'referral', inviterUserId: INVITER });
    inviteCohort = 'INVITE20';

    await completeLogin('+995555000001', { referralCode: 'TORNIKE20' });

    expect(grant).not.toHaveBeenCalled();
  });

  it('is still refused on a code that names nobody', async () => {
    eligibility.mockResolvedValue({ eligible: true, mode: 'open' });
    await expect(completeLogin('+995555000001', { referralCode: 'NOBODY' })).rejects.toBeInstanceOf(
      InvitationRequiredError,
    );
    expect(deletes).toBe(0);
  });

  it('is refused on its own code', async () => {
    eligibility.mockResolvedValue({ eligible: true, mode: 'referral', inviterUserId: OLD_ACCOUNT });
    await expect(completeLogin('+995555000001', { referralCode: 'MINE' })).rejects.toBeInstanceOf(
      InvitationRequiredError,
    );
  });
});
