jest.mock('../../db/postgres/client', () => ({ query: jest.fn(), __esModule: true }));

import { query } from '../../db/postgres/client';
import { checkRegistrationEligibility, subscribedInviter } from '../inviteGate.service';

/**
 * 58018 / 58019 (the founder, 14 Oct): „Netai is only and strictly invite only."
 * The real gate, with the three switches as production has them — invite_only,
 * netai_invite_only_login and invite_personal_code_only all on. Until today no
 * test ran the gate with „only a person's own code" on.
 */
const mockQuery = query as jest.MockedFunction<typeof query>;
const NEW_PHONE = '+995555000777';

interface World {
  readonly registered?: boolean;
  /** People holding this phone in their book: social proof, shut by personal-code-only. */
  readonly holders?: number;
  readonly codeOwner?: { id: number; subscription_status: string } | null;
  readonly cohort?: boolean;
  /** A subscriber behind the typed number. */
  readonly subscriberByPhone?: number | null;
}

function rows(data: unknown[]): { rows: unknown[]; rowCount: number } {
  return { rows: data, rowCount: data.length };
}

function live(world: World): void {
  mockQuery.mockImplementation((sql: string) => {
    if (sql.includes('app_flags')) return Promise.resolve(rows([{ enabled: true }]) as never);
    if (sql.includes('FROM invite_cohorts'))
      return Promise.resolve(
        rows(
          world.cohort
            ? [{ code: 'ACME', name: 'Acme', trial_days: 30, tier: 'pro', active: true }]
            : [],
        ) as never,
      );
    if (sql.includes('SELECT "userId" FROM "UserPhone"'))
      return Promise.resolve(rows(world.registered ? [{ userId: 42 }] : []) as never);
    if (sql.includes('FROM "UserAlias" ua'))
      return Promise.resolve(
        rows([
          { total: String(world.holders ?? 0), subscribed: String(world.holders ?? 0) },
        ]) as never,
      );
    if (sql.includes('UPPER(referral_code)'))
      return Promise.resolve(rows(world.codeOwner ? [world.codeOwner] : []) as never);
    if (sql.includes('subscription_status = ANY'))
      return Promise.resolve(
        rows(world.subscriberByPhone == null ? [] : [{ id: world.subscriberByPhone }]) as never,
      );
    if (sql.includes('JOIN "User" u ON u.id = up."userId"'))
      return Promise.resolve(rows([]) as never);
    // #5611: no limit on the member's link, and the member has the number saved.
    if (sql.includes('FROM invite_link_limits')) return Promise.resolve(rows([]) as never);
    if (sql.includes('FROM "UserAlias" WHERE "contactId" = $1 AND phone = ANY'))
      return Promise.resolve(rows([{ one: 1 }]) as never);
    throw new Error(`Unexpected query: ${sql}`);
  });
}

beforeEach(() => jest.clearAllMocks());

describe('nobody joins without an invitation (live switches)', () => {
  it('refuses a sign-up with no invitation at all', async () => {
    live({});
    expect(await checkRegistrationEligibility(NEW_PHONE)).toEqual({
      eligible: false,
      reason: 'referral_required',
    });
  });

  it('refuses a code that names nobody', async () => {
    live({ codeOwner: null });
    expect(await checkRegistrationEligibility(NEW_PHONE, undefined, 'NOBODY1')).toMatchObject({
      eligible: false,
    });
  });

  it('refuses the code of a member who is not subscribed', async () => {
    live({ codeOwner: { id: 7, subscription_status: 'canceled' } });
    expect(await checkRegistrationEligibility(NEW_PHONE, undefined, 'LAPSED1')).toEqual({
      eligible: false,
      reason: 'referrer_not_subscribed',
    });
  });

  it('refuses a company cohort code: only a person’s own code opens the door', async () => {
    live({ cohort: true, codeOwner: null });
    expect(await checkRegistrationEligibility(NEW_PHONE, undefined, 'ACME')).toMatchObject({
      eligible: false,
    });
  });

  it('refuses a phone that many members hold in their books (social proof is shut)', async () => {
    live({ holders: 50 });
    expect(await checkRegistrationEligibility(NEW_PHONE)).toMatchObject({ eligible: false });
  });

  it('admits a subscribed member’s own code, credited to that member', async () => {
    live({ codeOwner: { id: 501, subscription_status: 'active' } });
    expect(await checkRegistrationEligibility(NEW_PHONE, undefined, 'TORNIKE20')).toEqual({
      eligible: true,
      mode: 'referral',
      inviterUserId: 501,
    });
  });

  // §141 (Misho, 14 Oct: „ნომრით მოწვევაც დახურე"): only the member's own code invites.
  it('refuses a subscriber’s number typed as the inviter (§141)', async () => {
    live({ subscriberByPhone: 501 });
    expect(await checkRegistrationEligibility(NEW_PHONE, '+995555000501')).toEqual({
      eligible: false,
      reason: 'referral_required',
    });
  });
});

describe('the inviter an old account’s login needs (58019)', () => {
  it('is the subscribed owner of the code', async () => {
    live({ codeOwner: { id: 501, subscription_status: 'trialing' } });
    expect(await subscribedInviter('TORNIKE20')).toBe(501);
  });

  it('is nobody for a code whose owner is not subscribed', async () => {
    live({ codeOwner: { id: 7, subscription_status: 'canceled' } });
    expect(await subscribedInviter('LAPSED1')).toBeNull();
  });

  it('is nobody when no code is given (a typed number is no invitation, §141)', async () => {
    live({ subscriberByPhone: 501 });
    expect(await subscribedInviter()).toBeNull();
  });
});
