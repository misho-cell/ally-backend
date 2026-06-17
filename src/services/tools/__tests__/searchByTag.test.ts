jest.mock('../../../db/postgres/client', () => ({
  query: jest.fn(),
  __esModule: true,
}));

import { query } from '../../../db/postgres/client';
import { searchByTag } from '../searchByTag';

const mockQuery = query as jest.MockedFunction<typeof query>;

const mockRow = {
  phone: '+995555123456',
  name: 'ნინო',
  all_tags: ['engineer', 'tbilisi'],
  city: 'Tbilisi',
  jobPosition: 'Engineer',
  employer: 'Bank of Georgia',
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe('searchByTag', () => {
  it('returns results when tag matches', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [mockRow], rowCount: 1 } as never);

    const result = (await searchByTag('42', 'engineer')) as Record<string, unknown>;

    expect(result.found).toBe(true);
    expect(result.count).toBe(1);
    const results = result.results as Array<Record<string, unknown>>;
    expect(results[0].name).toBe('ნინო');
    expect(results[0].tags).toContain('engineer');
  });

  it('passes userId and lowercased term to query (Latin — no transliteration)', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [mockRow], rowCount: 1 } as never);

    await searchByTag('42', 'Engineer');

    expect(mockQuery.mock.calls[0][1]).toEqual(['42', '%engineer%']);
  });

  it('passes Georgian term plus transliteration for Georgian query', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [mockRow], rowCount: 1 } as never);

    await searchByTag('42', 'ინჟინერი');

    expect(mockQuery.mock.calls[0][1]).toEqual(['42', '%ინჟინერი%', '%inzhineri%']);
  });

  it('returns null name when no alias or registered name', async () => {
    const rowNoName = { ...mockRow, name: null };
    mockQuery.mockResolvedValueOnce({ rows: [rowNoName], rowCount: 1 } as never);

    const result = (await searchByTag('42', 'tbilisi')) as Record<string, unknown>;

    const results = result.results as Array<Record<string, unknown>>;
    expect(results[0].name).toBeNull();
  });

  it('returns found: false when no matches', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 } as never);

    const result = (await searchByTag('42', 'xyzzy')) as Record<string, unknown>;

    expect(result.found).toBe(false);
    expect(result.query).toBe('xyzzy');
  });

  it('returns found: false with error on DB failure', async () => {
    mockQuery.mockRejectedValueOnce(new Error('connection lost'));
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    const result = (await searchByTag('42', 'test')) as Record<string, unknown>;

    expect(result.found).toBe(false);
    expect(result.error).toBe('connection lost');
    consoleSpy.mockRestore();
  });

  it('filters null values from tags array', async () => {
    const rowWithNulls = { ...mockRow, all_tags: [null, 'engineer'] };
    mockQuery.mockResolvedValueOnce({ rows: [rowWithNulls], rowCount: 1 } as never);

    const result = (await searchByTag('42', 'engineer')) as Record<string, unknown>;

    const results = result.results as Array<Record<string, unknown>>;
    expect((results[0].tags as string[]).every(Boolean)).toBe(true);
  });
});
