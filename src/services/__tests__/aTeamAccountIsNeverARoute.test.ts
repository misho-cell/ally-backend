const mockQuery = jest.fn();
jest.mock('../../db/postgres/client', () => ({
  query: (...args: unknown[]) => mockQuery(...args),
}));

import {
  excludedHolderPhones,
  forgetExcludedHolders,
  listTeamAccounts,
  MAX_TEAM_ACCOUNTS_LISTED,
  setTeamAccountExcluded,
  TeamAccountExclusion,
} from '../excludedHolders.service';

/** A fictional account id; no real team member's id is ever written into git. */
const ACCOUNT = 900001;
const EXISTS = { rows: [{ id: ACCOUNT }], rowCount: 1 };
const NONE = { rows: [], rowCount: 0 };
const ONE_ROW = { rows: [], rowCount: 1 };

beforeEach(() => {
  mockQuery.mockReset();
  forgetExcludedHolders();
});

/** #8623 (DR10): a Netai team member's own account is never a route. */
describe('setTeamAccountExcluded', () => {
  it('marks an existing account with the team reason', async () => {
    mockQuery.mockResolvedValueOnce(EXISTS).mockResolvedValueOnce(ONE_ROW);

    await expect(setTeamAccountExcluded(ACCOUNT, true)).resolves.toBe(TeamAccountExclusion.Set);

    const [sql, params] = mockQuery.mock.calls[1] as [string, unknown[]];
    expect(sql).toContain('INSERT INTO excluded_holders');
    expect(sql).toContain('ON CONFLICT (user_id) DO NOTHING');
    expect(params).toEqual([ACCOUNT, 'netai_team']);
  });

  it('is already set when the account carries the team reason', async () => {
    mockQuery
      .mockResolvedValueOnce(EXISTS)
      .mockResolvedValueOnce(NONE)
      .mockResolvedValueOnce({ rows: [{ reason: 'netai_team' }], rowCount: 1 });

    await expect(setTeamAccountExcluded(ACCOUNT, true)).resolves.toBe(TeamAccountExclusion.Set);
  });

  it('leaves an account excluded for another reason as it is', async () => {
    mockQuery
      .mockResolvedValueOnce(EXISTS)
      .mockResolvedValueOnce(NONE)
      .mockResolvedValueOnce({ rows: [{ reason: 'copied_phonebook' }], rowCount: 1 });

    await expect(setTeamAccountExcluded(ACCOUNT, true)).resolves.toBe(
      TeamAccountExclusion.ExcludedForAnotherReason,
    );
    expect(mockQuery).toHaveBeenCalledTimes(3);
  });

  it('clears only a row with the team reason', async () => {
    mockQuery.mockResolvedValueOnce(EXISTS).mockResolvedValueOnce(ONE_ROW);

    await expect(setTeamAccountExcluded(ACCOUNT, false)).resolves.toBe(
      TeamAccountExclusion.Cleared,
    );

    const [sql, params] = mockQuery.mock.calls[1] as [string, unknown[]];
    expect(sql).toContain('DELETE FROM excluded_holders WHERE user_id = $1 AND reason = $2');
    expect(params).toEqual([ACCOUNT, 'netai_team']);
  });

  it('says there was nothing to clear when the account is not a team account', async () => {
    mockQuery.mockResolvedValueOnce(EXISTS).mockResolvedValueOnce(NONE);

    await expect(setTeamAccountExcluded(ACCOUNT, false)).resolves.toBe(
      TeamAccountExclusion.NotATeamAccount,
    );
  });

  it('refuses an id with no account, touching nothing', async () => {
    mockQuery.mockResolvedValueOnce(NONE);

    await expect(setTeamAccountExcluded(ACCOUNT, true)).resolves.toBe(
      TeamAccountExclusion.NoSuchUser,
    );
    expect(mockQuery).toHaveBeenCalledTimes(1);
  });

  it('clears the cache, so the next walk reads the new list', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ phone: '+995500000001' }], rowCount: 1 });
    await excludedHolderPhones();
    mockQuery.mockResolvedValueOnce(EXISTS).mockResolvedValueOnce(ONE_ROW);
    await setTeamAccountExcluded(ACCOUNT, true);
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

    await excludedHolderPhones();

    expect(mockQuery).toHaveBeenCalledTimes(4);
  });

  it('passes a database failure on to the caller', async () => {
    mockQuery.mockRejectedValueOnce(new Error('connection lost'));

    await expect(setTeamAccountExcluded(ACCOUNT, true)).rejects.toThrow('connection lost');
  });
});

describe('listTeamAccounts', () => {
  it('lists only ids with the team reason, with a limit', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ user_id: ACCOUNT }, { user_id: '900002' }] });

    await expect(listTeamAccounts()).resolves.toEqual([ACCOUNT, 900002]);

    const [sql, params] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('SELECT user_id FROM excluded_holders WHERE reason = $1');
    expect(sql).toContain('LIMIT $2');
    expect(params).toEqual(['netai_team', MAX_TEAM_ACCOUNTS_LISTED]);
  });
});
