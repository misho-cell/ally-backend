jest.mock('../../db/postgres/client', () => ({ __esModule: true, query: jest.fn() }));

import { query } from '../../db/postgres/client';
import { RESEARCH_FACTS_NOTE, researchFactsFor, researchPartOf } from '../researchFactsView';

const mockQuery = query as jest.MockedFunction<typeof query>;
const PHONE = '+995500000001';
const FACT = {
  field_type: 'employer',
  value: 'Bank A',
  status: 'possible',
  source_url: 'https://a.ge/x',
  found_on: '2025-03-01',
  conflict: null,
};

/** 4126 (D757 §3, §119.4) and §129's 6b + 6c: researched facts reach the model with their doubt. */
describe('researched facts are read with their doubt', () => {
  beforeEach(() => mockQuery.mockReset());

  it('reads only standing research facts, with status, source and date, limited', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [FACT] } as never);
    expect(await researchFactsFor(PHONE)).toEqual([FACT]);
    const [sql, params, timeout] = mockQuery.mock.calls[0];
    expect(String(sql)).toContain('removed_by_subject_at IS NULL');
    expect(String(sql)).toContain('retracted_at IS NULL');
    expect(params).toEqual([PHONE, 'public_research', 20]);
    expect(timeout).toBeGreaterThan(0);
  });

  it('carries Misho’s approved note with them, and nothing when there are none', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [FACT] } as never);
    expect(await researchPartOf(PHONE)).toEqual({
      research: [FACT],
      research_note: RESEARCH_FACTS_NOTE,
    });
    mockQuery.mockResolvedValueOnce({ rows: [] } as never);
    expect(await researchPartOf(PHONE)).toEqual({});
  });

  it('is the approved text, word for word', () => {
    expect(RESEARCH_FACTS_NOTE).toBe(
      'A fact marked possible comes from one source. Say it as possible, with where and when it was ' +
        'found — „possibly works at X (per site.ge, March 2025)" — never as certain. When you are not ' +
        'sure a contact still works where a fact says, ask the owner one short question before relying ' +
        'on it.',
    );
  });
});
