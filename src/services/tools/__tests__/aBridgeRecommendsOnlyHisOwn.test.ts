/**
 * Plate v301 G4: the contacts shown to a bridge are the bridge's OWN matches —
 * a match through a third person's private label is never offered to him.
 */
jest.mock('../../../db/postgres/client', () => ({ query: jest.fn(), __esModule: true }));
jest.mock('../../block.service', () => ({
  __esModule: true,
  getExcludedPhones: jest.fn().mockResolvedValue([]),
}));

import { query } from '../../../db/postgres/client';
import { getExcludedPhones } from '../../block.service';
import { ownMatchesFor } from '../searchByTag';

const mockQuery = query as jest.MockedFunction<typeof query>;
const mockExcluded = getExcludedPhones as jest.MockedFunction<typeof getExcludedPhones>;

interface Row {
  readonly phone: string;
  readonly name: string | null;
  readonly saved_as?: string | null;
  readonly own_hit: boolean;
}

function found(rows: readonly Row[]): void {
  mockQuery.mockImplementation((sql: string) => {
    if (String(sql).includes('COUNT'))
      return Promise.resolve({ rows: [{ total: String(rows.length) }], rowCount: 1 } as never);
    return Promise.resolve({
      rows: rows.map((r) => ({ all_tags: [], saved_as: null, ...r })),
      rowCount: rows.length,
    } as never);
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockExcluded.mockResolvedValue([]);
});

describe('ownMatchesFor', () => {
  it('returns only his own matches, named as he sees them', async () => {
    found([
      { phone: '1', name: 'Ilia', own_hit: true },
      { phone: '2', name: 'Stranger', own_hit: false },
      { phone: '3', name: null, saved_as: 'Nino lawyer', own_hit: true },
    ]);

    expect(await ownMatchesFor('551', 'lawyer', 4)).toEqual([
      { phone: '1', name: 'Ilia' },
      { phone: '3', name: 'Nino lawyer' },
    ]);
  });

  it('leaves out a contact he excluded', async () => {
    mockExcluded.mockResolvedValue(['1']);
    found([{ phone: '1', name: 'Ilia', own_hit: true }]);

    expect(await ownMatchesFor('551', 'lawyer', 4)).toEqual([]);
  });

  it('stops at the limit', async () => {
    found([1, 2, 3, 4, 5].map((i) => ({ phone: String(i), name: `P${i}`, own_hit: true })));

    expect(await ownMatchesFor('551', 'lawyer', 2)).toHaveLength(2);
  });

  it('asks nothing for an empty need', async () => {
    expect(await ownMatchesFor('551', '   ', 4)).toEqual([]);
    expect(mockQuery).not.toHaveBeenCalled();
  });
});
