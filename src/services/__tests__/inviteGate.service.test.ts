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
  // Lenient attribution lookup (any registered user, no subscription demand).
  attributedInviterId?: number | null;
}

// Route gate queries by a distinctive SQL fragment.
function routeGate(sql: string, world: GateWorld): { rows: unknown[]; rowCount: number } {
  if (sql.includes('app_flags')) return rows([{ enabled: world.flagEnabled }]);
  if (sql.includes('SELECT "userId" FROM "UserPhone"'))
    return world.registered ? rows([{ userId: 42 }]) : rows([]);
  if (sql.includes('FROM "UserAlias" ua'))
    return rows([{ total: String(world.totalOwners), subscribed: String(world.subscribedOwners) }]);
  if (sql.includes('subscription_status = ANY'))
    return world.referrerId === null ? rows([]) : rows([{ id: world.referrerId }]);
  if (sql.includes('JOIN "User" u ON u.id = up."userId"'))
    return world.attributedInviterId == null ? rows([]) : rows([{ id: world.attributedInviterId }]);
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
    mockQuery.mockResolvedValueOnce(rows([{ enabled: true }]) as never);

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

  it('matches phones by DIGITS, never by exact spelling (10 Aug: the door rejected real subscribers)', async () => {
    setWorld({ ...CLOSED_WORLD, referrerId: 167712 });

    await checkRegistrationEligibility('+995599000001', '+995 599 44 44 20');

    // The referrer lookup must compare regexp-stripped digits on both sides —
    // prod UserPhone spellings vary ('+995…', '995…', spaced), and exact
    // matching locked out every real subscriber.
    const referrerCall = mockQuery.mock.calls.find(
      ([sql]) =>
        (sql as string).includes('FROM "UserPhone" up') &&
        (sql as string).includes('subscription_status = ANY'),
    );
    expect(referrerCall).toBeDefined();
    expect(referrerCall?.[0]).toContain("regexp_replace(up.phone, '\\D', '', 'g') = $1");
    expect(referrerCall?.[1]?.[0]).toBe('995599444420');

    // The registered-phone check uses the same digits contract.
    const registeredCall = mockQuery.mock.calls.find(([sql]) =>
      (sql as string).includes('SELECT "userId" FROM "UserPhone"'),
    );
    expect(registeredCall?.[0]).toContain("regexp_replace(phone, '\\D', '', 'g') = $1");
    expect(registeredCall?.[1]?.[0]).toBe('995599000001');
  });

  it('probes UserAlias social proof with every realistic spelling of the number', async () => {
    setWorld(CLOSED_WORLD);

    await checkRegistrationEligibility('599 00 00 01');

    const aliasCall = mockQuery.mock.calls.find(([sql]) =>
      (sql as string).includes('FROM "UserAlias" ua'),
    );
    expect(aliasCall).toBeDefined();
    const variants = aliasCall?.[1]?.[0] as string[];
    expect(variants).toEqual(
      expect.arrayContaining(['+995599000001', '995599000001', '599000001', '0599000001']),
    );
  });

  it('counts only live HUMAN owners in social proof — no vendor dumps, no deleted accounts (ticket 4 blocker 4)', async () => {
    setWorld(CLOSED_WORLD);

    await checkRegistrationEligibility('599 00 00 01');

    const aliasCall = mockQuery.mock.calls.find(([sql]) =>
      (sql as string).includes('FROM "UserAlias" ua'),
    );
    const sql = aliasCall?.[0] as string;
    // Owner must be a real, non-deleted account (inner JOIN, not LEFT)…
    expect(sql).toContain('JOIN "User" u ON u.id = ua."contactId" AND u."deletedAt" IS NULL');
    expect(sql).not.toContain('LEFT JOIN');
    // …with a human-sized phonebook: one 40k-row purchased list under one
    // account must not vouch for every number it contains.
    expect(sql).toContain('HAVING');
    expect(aliasCall?.[1]?.[2]).toBe(15000);
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

describe('referral attribution with the gate off (earnings chain)', () => {
  it('records the inviter when a referral phone is provided', async () => {
    setWorld({ ...CLOSED_WORLD, flagEnabled: false, attributedInviterId: 55 });

    const result = await checkRegistrationEligibility('+995599000001', '+995599222222');

    expect(result).toEqual({ eligible: true, mode: 'open', inviterUserId: 55 });
  });

  it('never blocks registration when the referral phone is unknown', async () => {
    setWorld({ ...CLOSED_WORLD, flagEnabled: false, attributedInviterId: null });

    const result = await checkRegistrationEligibility('+995599000001', '+995599999999');

    expect(result.eligible).toBe(true);
    expect(result.inviterUserId).toBeUndefined();
  });

  it('ignores self-referral without touching the DB lookup', async () => {
    setWorld({ ...CLOSED_WORLD, flagEnabled: false, attributedInviterId: 55 });

    const result = await checkRegistrationEligibility('+995599000001', '599 00 00 01');

    expect(result.inviterUserId).toBeUndefined();
  });

  it('attributes the inviter on social-proof entry too (gate on)', async () => {
    setWorld({
      ...CLOSED_WORLD,
      totalOwners: 25,
      subscribedOwners: 0,
      attributedInviterId: 77,
    });

    const result = await checkRegistrationEligibility('+995599000001', '+995599222222');

    expect(result).toEqual({ eligible: true, mode: 'social', inviterUserId: 77 });
  });
});
