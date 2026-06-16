jest.mock('../../../db/postgres/client', () => ({
  query: jest.fn(),
  __esModule: true,
}));

import { query } from '../../../db/postgres/client';
import { searchByTag } from '../searchByTag';

const mockQuery = query as jest.MockedFunction<typeof query>;

const mockRow = {
  phone: '+995555123456',
  all_aliases: ['ნინო'],
  all_tags: ['engineer', 'tbilisi'],
  registered_name: 'ნინო ჯავახიშვილი',
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

    const result = (await searchByTag('engineer')) as Record<string, unknown>;

    expect(result.found).toBe(true);
    expect(result.count).toBe(1);
    const results = result.results as Array<Record<string, unknown>>;
    expect(results[0].name).toBe('ნინო ჯავახიშვილი');
    expect(results[0].tags).toContain('engineer');
  });

  it('performs case-insensitive search (LIKE lower)', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [mockRow], rowCount: 1 } as never);

    await searchByTag('Engineer');

    expect(mockQuery.mock.calls[0][1]).toEqual(['%engineer%']);
  });

  it('prefers registered_name over alias', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [mockRow], rowCount: 1 } as never);

    const result = (await searchByTag('tbilisi')) as Record<string, unknown>;

    const results = result.results as Array<Record<string, unknown>>;
    expect(results[0].name).toBe('ნინო ჯავახიშვილი');
  });

  it('falls back to alias when registered_name is null', async () => {
    const rowNoName = { ...mockRow, registered_name: null };
    mockQuery.mockResolvedValueOnce({ rows: [rowNoName], rowCount: 1 } as never);

    const result = (await searchByTag('tbilisi')) as Record<string, unknown>;

    const results = result.results as Array<Record<string, unknown>>;
    expect(results[0].name).toBe('ნინო');
  });

  it('returns found: false when no matches', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 } as never);

    const result = (await searchByTag('xyzzy')) as Record<string, unknown>;

    expect(result.found).toBe(false);
    expect(result.query).toBe('xyzzy');
  });

  it('returns found: false with error on DB failure', async () => {
    mockQuery.mockRejectedValueOnce(new Error('connection lost'));
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    const result = (await searchByTag('test')) as Record<string, unknown>;

    expect(result.found).toBe(false);
    expect(result.error).toBe('connection lost');
    consoleSpy.mockRestore();
  });
});
