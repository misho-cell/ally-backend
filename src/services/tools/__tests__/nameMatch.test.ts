jest.mock('../../../db/postgres/client', () => ({ query: jest.fn(), __esModule: true }));

import { query } from '../../../db/postgres/client';
import { findContactPhonesByName } from '../nameMatch';

const mockQuery = query as jest.MockedFunction<typeof query>;

function rows(data: unknown[]): { rows: unknown[]; rowCount: number } {
  return { rows: data, rowCount: data.length };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('findContactPhonesByName', () => {
  it('returns [] for an empty query without touching the database', async () => {
    const out = await findContactPhonesByName('7', '   ');

    expect(out).toEqual([]);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('returns every matching digit string, scoped to this user only', async () => {
    mockQuery.mockResolvedValue(rows([{ digits: '995599111222' }]) as never);

    const out = await findContactPhonesByName('7', 'სალომე');

    expect(out).toEqual(['995599111222']);
    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).toContain('"contactId" = $1::int');
    expect(params).toEqual(expect.arrayContaining(['7']));
  });

  it('surfaces multiple matches so the caller can decide ambiguity itself', async () => {
    mockQuery.mockResolvedValue(
      rows([{ digits: '995599111222' }, { digits: '995599333444' }]) as never,
    );

    const out = await findContactPhonesByName('7', 'სალომე');

    expect(out).toHaveLength(2);
  });

  it('respects a custom limit', async () => {
    mockQuery.mockResolvedValue(rows([]) as never);

    await findContactPhonesByName('7', 'გია', 3);

    expect(mockQuery.mock.calls[0][0]).toContain('LIMIT 3');
  });
});
