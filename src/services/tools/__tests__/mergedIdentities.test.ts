jest.mock('../../../db/postgres/client', () => ({
  __esModule: true,
  query: jest.fn(),
}));

import { query } from '../../../db/postgres/client';
import { collapseMergedPhones } from '../mergedIdentities';

const mockQuery = query as jest.MockedFunction<typeof query>;

function mapped(pairs: [string, string][]): void {
  mockQuery.mockResolvedValue({
    rows: pairs.map(([phone, person_id]) => ({ phone, person_id })),
    rowCount: pairs.length,
  } as never);
}

beforeEach(() => jest.clearAllMocks());

describe('collapseMergedPhones (Ticket 16 Task 23: a reviewed pair is one row)', () => {
  it('folds the second number into the first row and counts it, never showing it', async () => {
    mapped([
      ['+995599000001', 'p-1'],
      ['+995599000002', 'p-1'],
    ]);

    const out = await collapseMergedPhones([
      { phone: '+995599000001', name: 'Tornike Abuladze', employer: 'Arci' },
      { phone: '+995599000002', name: 'Tornike Abuladze', employer: null },
    ]);

    expect(out.rows).toHaveLength(1);
    expect(out.collapsed).toBe(1);
    expect(out.rows[0].phone).toBe('+995599000001');
    expect(out.rows[0].also_known_numbers).toBe(1);
    // The second number never travels — only the fact that there is one.
    expect(JSON.stringify(out.rows)).not.toContain('000002');
  });

  it('keeps the caller’s ranking: the first row of a person is the one kept', async () => {
    mapped([
      ['+995599000001', 'p-1'],
      ['+995599000002', 'p-1'],
    ]);

    const out = await collapseMergedPhones([
      { phone: '+995599000002', name: 'the richer row first' },
      { phone: '+995599000001', name: 'second' },
    ]);

    expect(out.rows[0].name).toBe('the richer row first');
  });

  it('leaves two different people alone', async () => {
    mapped([
      ['+995599000001', 'p-1'],
      ['+995599000002', 'p-2'],
    ]);

    const out = await collapseMergedPhones([
      { phone: '+995599000001', name: 'A' },
      { phone: '+995599000002', name: 'B' },
    ]);

    expect(out.rows).toHaveLength(2);
    expect(out.collapsed).toBe(0);
  });

  it('does not read the table for a single row, and never fails a search', async () => {
    expect(await collapseMergedPhones([{ phone: '+995599000001' }])).toEqual({
      rows: [{ phone: '+995599000001' }],
      collapsed: 0,
    });
    expect(mockQuery).not.toHaveBeenCalled();

    mockQuery.mockRejectedValue(new Error('table gone') as never);
    const rows = [{ phone: '+995599000001' }, { phone: '+995599000002' }];
    expect(await collapseMergedPhones(rows)).toEqual({ rows, collapsed: 0 });
  });

  it('unmerge separates them again: no mapping, no collapse', async () => {
    mapped([]);

    const out = await collapseMergedPhones([
      { phone: '+995599000001', name: 'A' },
      { phone: '+995599000002', name: 'A' },
    ]);

    expect(out.rows).toHaveLength(2);
    expect(out.collapsed).toBe(0);
  });
});
