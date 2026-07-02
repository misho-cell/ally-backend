jest.mock('../../db/postgres/client', () => ({ query: jest.fn(), __esModule: true }));

import { query } from '../../db/postgres/client';
import { checkRegistrationEligibility, isInviteOnlyEnabled } from '../inviteGate.service';

const mockQuery = query as jest.MockedFunction<typeof query>;

function rows(data: unknown[]): { rows: unknown[]; rowCount: number } {
  return { rows: data, rowCount: data.length };
}

interface GateWorld {
  flagEnabled: boolean;
  registered: boolean;
  totalOwners: number;
  subscribedOwners: number;
  referrerId: number | null;
}

// Route gate queries by a distinctive SQL fragment.
function routeGate(sql: string, world: GateWorld): { rows: unknown[]; rowCount: number } {
  if (sql.includes('FeatureFlags')) return rows([{ isEnabled: world.flagEnabled }]);
  if (sql.includes('SELECT "userId" FROM "UserPhone"'))
    return world.registered ? rows([{ userId: 42 }]) : rows([]);
  if (sql.includes('FROM "UserAlias" ua'))
    return rows([{ total: String(world.totalOwners), subscribed: String(world.subscribedOwners) }]);
  if (sql.includes('JOIN "User" u ON u.id = up."userId"'))
    return world.referrerId === null ? rows([]) : rows([{ id: world.referrerId }]);
  throw new Error(`Unexpected query: ${sql}`);
}

function setWorld(world: GateWorld): void {
  mockQuery.mockImplementation((sql: string) => Promise.resolve(routeGate(sql, world) as never));
}

const CLOSED_WORLD: GateWorld = {
  flagEnabled: true,
  registered: false,
  totalOwners: 0,
  subscribedOwners: 0,
  referrerId: null,
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe('isInviteOnlyEnabled', () => {
  it('is false when the flag row is missing', async () => {
    mockQuery.mockResolvedValueOnce(rows([]) as never);

    expect(await isInviteOnlyEnabled()).toBe(false);
  });

  it('reflects the flag value', async () => {
    mockQuery.mockResolvedValueOnce(rows([{ isEnabled: true }]) as never);

    expect(await isInviteOnlyEnabled()).toBe(true);
  });
});

describe('checkRegistrationEligibility', () => {
  it('lets everyone through when the gate is off', async () => {
    setWorld({ ...CLOSED_WORLD, flagEnabled: false });

    const result = await checkRegistrationEligibility('+995599000001');

    expect(result).toEqual({ eligible: true, mode: 'open' });
    expect(mockQuery).toHaveBeenCalledTimes(1);
  });

  it('lets already-registered phones through', async () => {
    setWorld({ ...CLOSED_WORLD, registered: true });

    const result = await checkRegistrationEligibility('+995599000001');

    expect(result).toEqual({ eligible: true, mode: 'existing' });
  });

  it('passes on social proof via 3 subscribed owners', async () => {
    setWorld({ ...CLOSED_WORLD, totalOwners: 5, subscribedOwners: 3 });

    const result = await checkRegistrationEligibility('+995599000001');

    expect(result).toEqual({ eligible: true, mode: 'social' });
  });

  it('passes on social proof via 20 total owners even with no subscribers', async () => {
    setWorld({ ...CLOSED_WORLD, totalOwners: 20, subscribedOwners: 0 });

    const result = await checkRegistrationEligibility('+995599000001');

    expect(result).toEqual({ eligible: true, mode: 'social' });
  });

  it('stays closed just below both thresholds', async () => {
    setWorld({ ...CLOSED_WORLD, totalOwners: 19, subscribedOwners: 2 });

    const result = await checkRegistrationEligibility('+995599000001');

    expect(result).toEqual({ eligible: false, reason: 'referral_required' });
  });

  it('requires a referral for unknown phones', async () => {
    setWorld(CLOSED_WORLD);

    const result = await checkRegistrationEligibility('+995599000001');

    expect(result).toEqual({ eligible: false, reason: 'referral_required' });
  });

  it('accepts a referral from a subscribed user and returns the inviter id', async () => {
    setWorld({ ...CLOSED_WORLD, referrerId: 167712 });

    const result = await checkRegistrationEligibility('+995599000001', '599 44 44 20');

    expect(result).toEqual({ eligible: true, mode: 'referral', inviterUserId: 167712 });
  });

  it('rejects a referral that is not a subscribed user', async () => {
    setWorld(CLOSED_WORLD);

    const result = await checkRegistrationEligibility('+995599000001', '+995599999999');

    expect(result).toEqual({ eligible: false, reason: 'referrer_not_subscribed' });
  });

  it('treats a blank referral as absent', async () => {
    setWorld(CLOSED_WORLD);

    const result = await checkRegistrationEligibility('+995599000001', '   ');

    expect(result).toEqual({ eligible: false, reason: 'referral_required' });
  });
});
