jest.mock('../../../db/postgres/client', () => ({
  query: jest.fn(),
  __esModule: true,
}));

import { query } from '../../../db/postgres/client';
import { searchContactByName } from '../searchContactByName';

const mockQuery = query as jest.MockedFunction<typeof query>;

const mockRow = {
  phone: '+995555123456',
  all_aliases: ['გიორგი', 'გიო'],
  all_tags: ['georgia', 'tbilisi'],
  registered_name: 'გიორგი ბერიძე',
  city: 'Tbilisi',
  jobPosition: 'Engineer',
  employer: 'TBC Bank',
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe('searchContactByName', () => {
  it('returns found: true with results on match', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [mockRow], rowCount: 1 } as never);

    const result = (await searchContactByName('გიორგი')) as Record<string, unknown>;

    expect(result.found).toBe(true);
    expect(result.count).toBe(1);
    const results = result.results as Array<Record<string, unknown>>;
    expect(results[0].name).toBe('გიორგი ბერიძე');
    expect(results[0].city).toBe('Tbilisi');
    expect(results[0].employer).toBe('TBC Bank');
  });

  it('uses registered_name over alias when available', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [mockRow], rowCount: 1 } as never);

    const result = (await searchContactByName('გიო')) as Record<string, unknown>;

    const results = result.results as Array<Record<string, unknown>>;
    expect(results[0].name).toBe('გიორგი ბერიძე');
  });

  it('falls back to alias when registered_name is null', async () => {
    const rowNoName = { ...mockRow, registered_name: null };
    mockQuery.mockResolvedValueOnce({ rows: [rowNoName], rowCount: 1 } as never);

    const result = (await searchContactByName('გიო')) as Record<string, unknown>;

    const results = result.results as Array<Record<string, unknown>>;
    expect(results[0].name).toBe('გიორგი');
  });

  it('returns found: false when no matches', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 } as never);

    const result = (await searchContactByName('unknown')) as Record<string, unknown>;

    expect(result.found).toBe(false);
    expect(result.query).toBe('unknown');
  });

  it('returns found: false with error message on DB failure', async () => {
    mockQuery.mockRejectedValueOnce(new Error('DB error'));
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    const result = (await searchContactByName('test')) as Record<string, unknown>;

    expect(result.found).toBe(false);
    expect(result.error).toBe('DB error');
    consoleSpy.mockRestore();
  });

  it('filters out null/undefined aliases and tags', async () => {
    const rowWithNulls = { ...mockRow, all_aliases: [null, 'გიო'], all_tags: [null, 'tbilisi'] };
    mockQuery.mockResolvedValueOnce({ rows: [rowWithNulls], rowCount: 1 } as never);

    const result = (await searchContactByName('გიო')) as Record<string, unknown>;

    const results = result.results as Array<Record<string, unknown>>;
    expect((results[0].aliases as string[]).every(Boolean)).toBe(true);
    expect((results[0].tags as string[]).every(Boolean)).toBe(true);
  });
});
