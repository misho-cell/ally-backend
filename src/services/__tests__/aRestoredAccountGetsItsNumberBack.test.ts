const mockClientQuery = jest.fn();
jest.mock('../../db/postgres/client', () => ({
  __esModule: true,
  query: jest.fn(),
  withTransaction: (cb: (c: unknown) => Promise<unknown>) => cb({ query: mockClientQuery }),
}));

import { PhoneRepair, repairRestoredPhone } from '../accountRestore.service';

const TOMB = { id: 7, phone: '+995500000001_DELETED_123456' };

function route(holder: { user_id: number; used_netai: boolean } | null): void {
  mockClientQuery.mockImplementation((sql: string) => {
    if (sql.includes('_DELETED_[0-9]+$')) return Promise.resolve({ rows: [TOMB] });
    if (sql.includes('AS used_netai')) return Promise.resolve({ rows: holder ? [holder] : [] });
    return Promise.resolve({ rows: [], rowCount: 1 });
  });
}

const writes = (): [string, unknown[]][] =>
  (mockClientQuery.mock.calls as [string, unknown[]][]).filter(([sql]) => sql.startsWith('UPDATE'));

beforeEach(() => jest.resetAllMocks());

/** #7761: Giorgi's restored account kept „<number>_DELETED_<n>"; signing in opened an empty one. */
describe('a restored account gets its number back', () => {
  it('takes the number back and retires the empty account that took it', async () => {
    route({ user_id: 190086, used_netai: false });
    expect(await repairRestoredPhone(118509, false)).toEqual({
      outcome: PhoneRepair.Repaired,
      retired_user_id: 190086,
    });
    const [retirePhone, retireUser, restore] = writes();
    expect(retirePhone?.[0]).toContain("phone = phone || '_MERGED_'");
    expect(retirePhone?.[1]).toEqual([190086, 118509, '+995500000001']);
    expect(retireUser?.[0]).toContain('SET "deletedAt" = NOW()');
    expect(restore?.[1]).toEqual([7, '+995500000001']);
  });

  it('changes nothing when the other account has used Netai', async () => {
    route({ user_id: 190086, used_netai: true });
    expect((await repairRestoredPhone(118509, false)).outcome).toBe(PhoneRepair.NumberInUse);
    expect(writes()).toEqual([]);
  });

  it('writes nothing on a dry run, and nothing when the number is whole', async () => {
    route(null);
    expect((await repairRestoredPhone(118509, true)).outcome).toBe(PhoneRepair.Repaired);
    expect(writes()).toEqual([]);
    mockClientQuery.mockResolvedValue({ rows: [] });
    expect((await repairRestoredPhone(118509, false)).outcome).toBe(PhoneRepair.NothingToRepair);
  });
});
