jest.mock('../../../db/postgres/client', () => ({
  query: jest.fn(),
  __esModule: true,
}));

// Block filtering issues its own query; stub it so the `query` mock below
// only sees the search call (keeps call-arg assertions on index 0).
jest.mock('../../block.service', () => ({
  __esModule: true,
  getBlockedPhones: jest.fn().mockResolvedValue([]),
}));

import { query } from '../../../db/postgres/client';
import { searchContactByName } from '../searchContactByName';

const mockQuery = query as jest.MockedFunction<typeof query>;

const mockRow = {
  phone: '+995555123456',
  name: 'გიორგი',
  all_tags: ['georgia', 'tbilisi'],
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

    const result = (await searchContactByName('42', 'გიორგი')) as Record<string, unknown>;

    expect(result.found).toBe(true);
    expect(result.count).toBe(1);
    const results = result.results as Array<Record<string, unknown>>;
    expect(results[0].name).toBe('გიორგი');
    expect(results[0].city).toBe('Tbilisi');
    expect(results[0].employer).toBe('TBC Bank');
  });

  it('passes userId and lowercased Georgian term plus transliteration to query', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [mockRow], rowCount: 1 } as never);

    await searchContactByName('42', 'გიო');

    expect(mockQuery.mock.calls[0][1]).toEqual(['42', '%გიო%', '%gio%', []]);
  });

  it('passes only one term for Latin query (no transliteration)', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [mockRow], rowCount: 1 } as never);

    await searchContactByName('42', 'George');

    expect(mockQuery.mock.calls[0][1]).toEqual(['42', '%george%', []]);
  });

  it('returns null name when no alias or registered name', async () => {
    const rowNoName = { ...mockRow, name: null };
    mockQuery.mockResolvedValueOnce({ rows: [rowNoName], rowCount: 1 } as never);

    const result = (await searchContactByName('42', 'გიო')) as Record<string, unknown>;

    const results = result.results as Array<Record<string, unknown>>;
    expect(results[0].name).toBeNull();
  });

  it('returns found: false when no matches', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 } as never);

    const result = (await searchContactByName('42', 'unknown')) as Record<string, unknown>;

    expect(result.found).toBe(false);
    expect(result.query).toBe('unknown');
  });

  it('returns found: false with error message on DB failure', async () => {
    mockQuery.mockRejectedValueOnce(new Error('DB error'));
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    const result = (await searchContactByName('42', 'test')) as Record<string, unknown>;

    expect(result.found).toBe(false);
    expect(result.error).toBe('DB error');
    consoleSpy.mockRestore();
  });

  it('filters null values from tags array', async () => {
    const rowWithNulls = { ...mockRow, all_tags: [null, 'tbilisi'] };
    mockQuery.mockResolvedValueOnce({ rows: [rowWithNulls], rowCount: 1 } as never);

    const result = (await searchContactByName('42', 'გიო')) as Record<string, unknown>;

    const results = result.results as Array<Record<string, unknown>>;
    expect((results[0].tags as string[]).every(Boolean)).toBe(true);
  });
});
