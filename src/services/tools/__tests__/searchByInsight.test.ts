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

function rows(data: unknown[]): { rows: unknown[]; rowCount: number } {
  return { rows: data, rowCount: data.length };
}

const insightRow = {
  neo4j_contact_id: '+995599000123',
  neo4j_contact_name: 'გიორგი ბერიძე',
  data: { mood: 'positive', note: 'met at conference' },
};

// Concept search reads two sources in parallel — contact_facts (the user's
// saved facts) and contact_insights (AI enrichment) — then merges by phone.
function setup(opts: { facts?: unknown[]; insights?: unknown[] }): void {
  const facts = opts.facts ?? [];
  const insights = opts.insights ?? [];
  mockQuery.mockImplementation((sql: string) => {
    if (sql.includes('FROM contact_facts')) return Promise.resolve(rows(facts) as never);
    if (sql.includes('FROM contact_insights')) return Promise.resolve(rows(insights) as never);
    throw new Error(`Unexpected query: ${sql}`);
  });
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('searchByInsight', () => {
  it('finds a contact through a saved fact (the "MKD Law" case)', async () => {
    setup({
      facts: [{ phone: '+995599777777', name: 'Nino', matched: ['employer: MKD Law'] }],
    });

    const result = (await searchByInsight('42', 'MKD Law')) as Record<string, unknown>;

    expect(result.found).toBe(true);
    const results = result.results as Array<Record<string, unknown>>;
    expect(results[0].name).toBe('Nino');
    expect(results[0].matched).toEqual(['employer: MKD Law']);
    expect(results[0].contact_id).toBe('+995599777777');
  });

  it('finds a contact through enrichment insights', async () => {
    setup({ insights: [insightRow] });

    const result = (await searchByInsight('42', 'conference')) as Record<string, unknown>;

    expect(result.found).toBe(true);
    const results = result.results as Array<Record<string, unknown>>;
    expect(results[0].name).toBe('გიორგი ბერიძე');
    expect(results[0].info).toEqual(insightRow.data);
  });

  it('lowercases the search term for both sources', async () => {
    setup({ facts: [], insights: [] });

    await searchByInsight('42', 'CONFERENCE');

    for (const call of mockQuery.mock.calls) {
      expect(call[1] as string[]).toContain('%conference%');
    }
  });

  it('merges the same phone from both sources into one result', async () => {
    setup({
      facts: [{ phone: '+995599777777', name: 'Nino', matched: ['occupation: lawyer'] }],
      insights: [{ ...insightRow, neo4j_contact_id: '+995599777777' }],
    });

    const result = (await searchByInsight('42', 'law')) as Record<string, unknown>;

    expect(result.count).toBe(1);
    const row = (result.results as Array<Record<string, unknown>>)[0];
    expect(row.matched).toEqual(['occupation: lawyer']);
    expect(row.info).toEqual(insightRow.data);
  });

  it('returns found: false when neither source matches', async () => {
    setup({ facts: [], insights: [] });

    const result = (await searchByInsight('42', 'nothing')) as Record<string, unknown>;

    expect(result.found).toBe(false);
    expect(result.query).toBe('nothing');
  });

  it('returns found: false with error on DB failure', async () => {
    mockQuery.mockRejectedValue(new Error('query timeout') as never);
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    const result = (await searchByInsight('42', 'test')) as Record<string, unknown>;

    expect(result.found).toBe(false);
    expect(result.error).toBe('query timeout');
    consoleSpy.mockRestore();
  });
});
