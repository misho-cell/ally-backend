jest.mock('../../../db/postgres/client', () => ({ query: jest.fn(), __esModule: true }));

import { query } from '../../../db/postgres/client';
import { fetchRelationshipForPhones, fetchHumanTierForPhones } from '../relationshipScores';

const mockQuery = query as jest.MockedFunction<typeof query>;

function rows(data: unknown[]): { rows: unknown[]; rowCount: number } {
  return { rows: data, rowCount: data.length };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('fetchHumanTierForPhones', () => {
  it('reads human_relationship_tiers, scoped to the user — a separate table from the machine-computed scores, ticket 6 task 4', async () => {
    mockQuery.mockResolvedValue(rows([{ contact_phone: '+995500000001', tier: 'green' }]) as never);

    const out = await fetchHumanTierForPhones('501', ['+995500000001']);

    expect(out.get('+995500000001')).toBe('green');
    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).toContain('FROM human_relationship_tiers');
    expect(params).toEqual(['501', ['+995500000001']]);
  });

  it('returns an empty map for an empty phone list without querying', async () => {
    const out = await fetchHumanTierForPhones('501', []);
    expect(out.size).toBe(0);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('fails soft to an empty map, never throws — a search must never break because this table has a problem', async () => {
    mockQuery.mockRejectedValue(new Error('db down'));

    const out = await fetchHumanTierForPhones('501', ['+995500000001']);

    expect(out.size).toBe(0);
  });

  it('never touches contact_relationship_scores — the two must stay on separate reads so a hand-set tier can never be confused with a computed one', async () => {
    mockQuery.mockResolvedValue(rows([]) as never);

    await fetchHumanTierForPhones('501', ['+995500000001']);

    const [sql] = mockQuery.mock.calls[0];
    expect(sql).not.toContain('contact_relationship_scores');
  });
});

describe('fetchRelationshipForPhones (unchanged — stays reading only the machine table)', () => {
  it('reads contact_relationship_scores, not human_relationship_tiers', async () => {
    mockQuery.mockResolvedValue(
      rows([
        { contact_phone: '+995500000001', relationship_type: 'close', strength_score: 0.8 },
      ]) as never,
    );

    const out = await fetchRelationshipForPhones('501', ['+995500000001']);

    expect(out.get('+995500000001')).toEqual({ relationship: 'close', strength: 0.8 });
    const [sql] = mockQuery.mock.calls[0];
    expect(sql).toContain('FROM contact_relationship_scores');
    expect(sql).not.toContain('human_relationship_tiers');
  });
});
