jest.mock('../referralCode.service', () => ({
  __esModule: true,
  findUserByReferralCode: jest.fn(),
}));
jest.mock('../inviteCohorts.service', () => ({ __esModule: true, findCohortByCode: jest.fn() }));
jest.mock('../inviteGate.service', () => ({
  __esModule: true,
  isPersonalCodeOnlyEnabled: jest.fn(),
}));

import { readFileSync } from 'fs';
import { join } from 'path';
import { findCohortByCode } from '../inviteCohorts.service';
import { isPersonalCodeOnlyEnabled } from '../inviteGate.service';
import { inviteCodeExists } from '../inviteCodeCheck.service';
import { findUserByReferralCode } from '../referralCode.service';

/** 2641 (§99.11): the join page asks whether a code would be taken, before the welcome. */
const personal = findUserByReferralCode as jest.MockedFunction<typeof findUserByReferralCode>;
const cohort = findCohortByCode as jest.MockedFunction<typeof findCohortByCode>;
const personalOnly = isPersonalCodeOnlyEnabled as jest.MockedFunction<
  typeof isPersonalCodeOnlyEnabled
>;
const A_COHORT = { code: 'TEAM' } as Awaited<ReturnType<typeof findCohortByCode>>;

beforeEach(() => {
  personal.mockReset().mockResolvedValue(null);
  cohort.mockReset().mockResolvedValue(null);
  personalOnly.mockReset().mockResolvedValue(false);
});

describe('inviteCodeExists', () => {
  it('is yes for a member’s own code, without reading the cohorts', async () => {
    personal.mockResolvedValue({ userId: 7, subscribed: true });
    await expect(inviteCodeExists('ABC123')).resolves.toBe(true);
    expect(cohort).not.toHaveBeenCalled();
  });

  it('is yes for a cohort code while personal-codes-only is off, no while it is on', async () => {
    cohort.mockResolvedValue(A_COHORT);
    await expect(inviteCodeExists('TEAM')).resolves.toBe(true);
    personalOnly.mockResolvedValue(true);
    await expect(inviteCodeExists('TEAM')).resolves.toBe(false);
  });

  it('is no for a made-up code', async () => {
    await expect(inviteCodeExists('NOPE42')).resolves.toBe(false);
  });
});

describe('GET /invite-codes/:code', () => {
  const route = readFileSync(
    join(__dirname, '..', '..', 'api', 'routes', 'inviteCodes.routes.ts'),
    'utf8',
  );
  const index = readFileSync(join(__dirname, '..', '..', 'index.ts'), 'utf8');

  it('is public, rate-limited by IP, and mounted', () => {
    expect(route).not.toContain('authenticateJwt');
    expect(route).toContain(
      "rateLimit({ windowMs: CHECK_WINDOW_MS, max: CHECKS_PER_ADDRESS, keyBy: 'ip' })",
    );
    expect(index).toContain("app.use('/invite-codes', inviteCodesRouter);");
  });

  it('refuses a malformed code with 400 and answers one bit', () => {
    expect(route).toContain(
      "param('code').trim().isLength({ min: 1, max: MAX_CODE_CHARS }).matches(CODE_RE),",
    );
    expect(route).toContain(
      "res.status(400).json({ success: false, error: 'Not a valid invite code' });",
    );
    expect(route).toContain('res.status(200).json({ success: true, data: { exists } });');
  });
});
