jest.mock('../../../db/postgres/client', () => ({ query: jest.fn(), __esModule: true }));
jest.mock('../../../db/neo4j/client', () => ({
  __esModule: true,
  getSession: jest.fn().mockReturnValue({
    run: jest.fn().mockResolvedValue({ records: [] }),
    close: jest.fn().mockResolvedValue(undefined),
  }),
}));
jest.mock('../../neo4j.keys', () => ({
  __esModule: true,
  getCompositeKeyForUser: jest.fn().mockResolvedValue('+995500000001'),
  getCompositeKeyForPhone: jest.fn().mockResolvedValue('+995555000006'),
}));
jest.mock('../../productEvents.service', () => ({
  __esModule: true,
  recordProductEvent: jest.fn().mockResolvedValue(undefined),
}));

import { query } from '../../../db/postgres/client';
import { removeContactFromNetwork } from '../removeContactFromNetwork';

const mockQuery = query as jest.MockedFunction<typeof query>;

function rows(data: unknown[], rowCount = data.length): { rows: unknown[]; rowCount: number } {
  return { rows: data, rowCount };
}

beforeEach(() => jest.clearAllMocks());

describe('removeContactFromNetwork (D23 path 1)', () => {
  it("removes the user's OWN rows only — aliases, tags, score, enrichment", async () => {
    mockQuery.mockImplementation((sql: string) => {
      if (sql.includes('SELECT alias')) return Promise.resolve(rows([{ alias: 'ზურა' }]) as never);
      if (sql.includes('DELETE FROM "UserAlias"')) return Promise.resolve(rows([], 1) as never);
      if (sql.includes('DELETE FROM "UserTags"')) return Promise.resolve(rows([], 2) as never);
      return Promise.resolve(rows([]) as never);
    });

    const out = await removeContactFromNetwork('170748', '+995555000006');

    expect(out.removed).toBe(true);
    expect(out.aliases_removed).toBe(1);
    expect(out.tags_removed).toBe(2);
    // The user's saved facts are NOT touched — notes stay, detached.
    expect(
      mockQuery.mock.calls.some((c) => (c[0] as string).includes('DELETE FROM contact_facts')),
    ).toBe(false);
    // Every delete is scoped to THIS user's rows.
    const aliasDelete = mockQuery.mock.calls.find((c) =>
      (c[0] as string).includes('DELETE FROM "UserAlias"'),
    );
    expect(aliasDelete?.[1]).toEqual(['170748', '+995555000006']);
  });

  it('refuses a phone that is not in the network — nothing deleted', async () => {
    mockQuery.mockResolvedValue(rows([]) as never);

    const out = await removeContactFromNetwork('170748', '+995599999999');

    expect(out.removed).toBe(false);
    expect(mockQuery.mock.calls.some((c) => (c[0] as string).includes('DELETE'))).toBe(false);
  });
});
