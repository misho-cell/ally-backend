jest.mock('../../../db/postgres/client', () => ({ query: jest.fn(), __esModule: true }));
jest.mock('../../referralCode.service', () => ({
  __esModule: true,
  getOrCreateReferralCode: jest.fn().mockResolvedValue('ABC123'),
}));
jest.mock('../membership', () => ({
  __esModule: true,
  fetchAccountStates: jest.fn(),
  accountStateFor: jest.fn(),
}));

import { query } from '../../../db/postgres/client';
import { accountStateFor, fetchAccountStates } from '../membership';
import { inviteContact } from '../inviteContact';

const mockQuery = query as jest.MockedFunction<typeof query>;
const mockStates = fetchAccountStates as jest.MockedFunction<typeof fetchAccountStates>;
const mockStateFor = accountStateFor as jest.MockedFunction<typeof accountStateFor>;

const PHONE = '+995599000000';

/** The contact is in the owner's phonebook, and nobody has been invited before. */
function routeQueries(opts: { priorInvite?: boolean } = {}): void {
  mockQuery.mockImplementation((sql: string) => {
    if (sql.includes('FROM "UserAlias"'))
      return Promise.resolve({ rows: [{ alias: 'გიორგი' }], rowCount: 1 } as never);
    if (sql.includes('FROM invites'))
      return Promise.resolve({
        rows: opts.priorInvite === true ? [{ created_at: '2026-09-01T00:00:00Z' }] : [],
        rowCount: opts.priorInvite === true ? 1 : 0,
      } as never);
    return Promise.resolve({ rows: [], rowCount: 0 } as never);
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockStates.mockResolvedValue(new Map());
  routeQueries();
});

/**
 * Ticket 20 row 153 — „already a Netai member" was true of an ACCOUNT and false
 * of a PERSON.
 *
 * Read by the tester on Lika's threads 16441 and 16442: Giorgi Khatiashvili,
 * user 4511, created 20 March 2024, lastActiveAt null, 127 contacts. An old
 * Ally account that has never opened Netai. The tool told her „this person is
 * already a Netai member — no invitation needed", which was untrue to her, gave
 * her nothing to do, and meant the share button could never appear.
 *
 * D61 is the whole growth story: 62,146 such accounts against 42 real users on
 * 3 September. Refusing all of them as members turns the target list into a
 * wall.
 */
describe('invite_contact knows the three states apart', () => {
  it('WAKES an old Ally account instead of refusing it', async () => {
    mockStateFor.mockReturnValue('ally_account');

    const out = await inviteContact('501', PHONE, 'ka');

    expect(out.success).toBe(true);
    expect(out.kind).toBe('wake');
    expect(out.invite_text).toBeDefined();
  });

  it('the wake text offers no referral code, because they cannot be referred', async () => {
    mockStateFor.mockReturnValue('ally_account');

    const out = await inviteContact('501', PHONE, 'ka');

    expect(out.invite_text).not.toContain('ABC123');
    // What they are actually missing: that it is there and their own number
    // already works.
    expect(out.invite_text).toContain('netai.guru');
  });

  it('still REFUSES somebody who has actually used Netai — and says what to do instead', async () => {
    mockStateFor.mockReturnValue('netai_user');

    const out = await inviteContact('501', PHONE, 'ka');

    expect(out.success).toBe(false);
    expect(out.error).toContain('პირდაპირ');
    expect(out.invite_text).toBeUndefined();
  });

  it('invites somebody with no account at all, with the code', async () => {
    mockStateFor.mockReturnValue('none');

    const out = await inviteContact('501', PHONE, 'ka');

    expect(out.kind).toBe('invite');
    expect(out.invite_text).toContain('ABC123');
  });

  it('carries the kind through the already-invited answer too', async () => {
    // Otherwise the second attempt on the same person reverts to calling a
    // wake an invitation.
    mockStateFor.mockReturnValue('ally_account');
    routeQueries({ priorInvite: true });

    const out = await inviteContact('501', PHONE, 'ka');

    expect(out.already_invited).toBe(true);
    expect(out.kind).toBe('wake');
    expect(out.invite_text).not.toContain('ABC123');
  });

  it('a number outside the owner’s contacts is still refused, before any state is read', async () => {
    mockQuery.mockResolvedValue({ rows: [], rowCount: 0 } as never);

    const out = await inviteContact('501', PHONE, 'ka');

    expect(out.success).toBe(false);
    expect(mockStates).not.toHaveBeenCalled();
  });
});
