jest.mock('../../../db/postgres/client', () => ({
  query: jest.fn(),
  __esModule: true,
}));

jest.mock('../../block.service', () => ({
  __esModule: true,
  getExcludedPhoneSet: jest.fn().mockResolvedValue(new Set<string>()),
}));

import { query } from '../../../db/postgres/client';
import { searchByInsight } from '../searchByInsight';

const mockQuery = query as jest.MockedFunction<typeof query>;

const mockRow = {
  neo4j_contact_id: 'node-123',
  neo4j_contact_name: 'გიორგი ბერიძე',
  data: { mood: 'positive', note: 'met at conference' },
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe('searchByInsight', () => {
  it('returns results when query matches contact name or data', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [mockRow], rowCount: 1 } as never);

    const result = (await searchByInsight('42', 'conference')) as Record<string, unknown>;

    expect(result.found).toBe(true);
    expect(result.count).toBe(1);
    const results = result.results as Array<Record<string, unknown>>;
    expect(results[0].name).toBe('გიორგი ბერიძე');
    expect(results[0].info).toEqual(mockRow.data);
  });

  it('performs case-insensitive search', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [mockRow], rowCount: 1 } as never);

    await searchByInsight('42', 'CONFERENCE');

    expect(mockQuery.mock.calls[0][1]).toEqual(['%conference%']);
  });

  it('returns found: false when no matches', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 } as never);

    const result = (await searchByInsight('42', 'nothing')) as Record<string, unknown>;

    expect(result.found).toBe(false);
    expect(result.query).toBe('nothing');
  });

  it('returns multiple results', async () => {
    const secondRow = { ...mockRow, neo4j_contact_id: 'node-456', neo4j_contact_name: 'ნინო' };
    mockQuery.mockResolvedValueOnce({ rows: [mockRow, secondRow], rowCount: 2 } as never);

    const result = (await searchByInsight('42', 'mood')) as Record<string, unknown>;

    expect(result.count).toBe(2);
  });

  it('handles null contact name gracefully', async () => {
    const rowNullName = { ...mockRow, neo4j_contact_name: null };
    mockQuery.mockResolvedValueOnce({ rows: [rowNullName], rowCount: 1 } as never);

    const result = (await searchByInsight('42', 'test')) as Record<string, unknown>;

    const results = result.results as Array<Record<string, unknown>>;
    expect(results[0].name).toBeNull();
  });

  it('returns found: false with error on DB failure', async () => {
    mockQuery.mockRejectedValueOnce(new Error('query timeout'));
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    const result = (await searchByInsight('42', 'test')) as Record<string, unknown>;

    expect(result.found).toBe(false);
    expect(result.error).toBe('query timeout');
    consoleSpy.mockRestore();
  });
});
