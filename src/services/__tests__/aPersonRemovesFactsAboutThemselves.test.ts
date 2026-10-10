jest.mock('../../db/postgres/client', () => ({ __esModule: true, query: jest.fn() }));

import { query } from '../../db/postgres/client';
import {
  FactOrigin,
  factsAboutMe,
  originOf,
  removeFactAboutMe,
  RemoveOutcome,
} from '../factsAboutMe.service';

const mockQuery = query as jest.MockedFunction<typeof query>;
const ME = 171;

/** 4126 item 5 (Misho's yes, 9 Oct): a person sees and removes the facts about themselves. */
describe('facts about me', () => {
  beforeEach(() => jest.clearAllMocks());

  it('reads only the person’s own numbers, and never says who saved a fact', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ phone: '+995 500 000 001' }] } as never)
      .mockResolvedValueOnce({
        rows: [
          {
            id: 9,
            field_type: 'employer',
            value: 'Acme',
            source: 'chat',
            source_url: null,
            fact_date: null,
            saved_on: '2026-09-01',
            research_status: null,
          },
        ],
      } as never);
    const facts = await factsAboutMe(ME);
    expect(facts).toEqual([
      {
        id: 9,
        field: 'employer',
        value: 'Acme',
        origin: FactOrigin.SavedBySomeone,
        source_url: null,
        date: '2026-09-01',
        status: null,
      },
    ]);
    const [sql, params] = mockQuery.mock.calls[1];
    expect(String(sql)).not.toContain('submitted_by_user_id');
    expect(String(sql)).toContain('retracted_at IS NULL');
    expect(params).toEqual([['+995500000001'], 200]);
  });

  it('names the kind of source', () => {
    expect(originOf('public_research')).toBe(FactOrigin.Research);
    expect(originOf('label')).toBe(FactOrigin.Label);
    expect(originOf(null)).toBe(FactOrigin.SavedBySomeone);
  });

  it('removes a fact about the person for good, and only theirs', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ phone: '+995500000001' }] } as never)
      .mockResolvedValueOnce({ rows: [], rowCount: 1 } as never);
    await expect(removeFactAboutMe(ME, 9)).resolves.toBe(RemoveOutcome.Removed);
    const [sql, params] = mockQuery.mock.calls[1];
    expect(String(sql)).toContain('removed_by_subject_at = NOW()');
    expect(String(sql)).toContain('is_matchable = false');
    expect(String(sql)).toContain('neo4j_contact_id = ANY($2::text[])');
    expect(params).toEqual([9, ['+995500000001']]);
  });

  it('says not found for someone else’s fact, and for a person with no number', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ phone: '+995500000001' }] } as never)
      .mockResolvedValueOnce({ rows: [], rowCount: 0 } as never)
      .mockResolvedValueOnce({ rows: [] } as never);
    await expect(removeFactAboutMe(ME, 10)).resolves.toBe(RemoveOutcome.NotFound);
    await expect(removeFactAboutMe(ME, 10)).resolves.toBe(RemoveOutcome.NotFound);
    expect(mockQuery).toHaveBeenCalledTimes(3);
  });
});
