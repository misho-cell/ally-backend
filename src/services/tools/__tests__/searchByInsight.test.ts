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

// Concept search reads three isolated sources — the user's own saved facts and
// crowd-confirmed public facts (both from contact_facts, split into two queries
// so one bound parameter is never compared to two column types) plus
// contact_insights (AI enrichment) — then merges by phone. Own vs. public are
// told apart by their WHERE clause: `submitted_by_user_id = $1` vs. `is_public`.
function setup(opts: {
  facts?: unknown[];
  publicFacts?: unknown[];
  insights?: unknown[];
  pointerCandidates?: unknown[];
  pointerStrengths?: unknown[];
}): void {
  const own = opts.facts ?? [];
  const pub = opts.publicFacts ?? [];
  const insights = opts.insights ?? [];
  mockQuery.mockImplementation((sql: string) => {
    if (sql.includes('cf.submitted_by_user_id = $1')) return Promise.resolve(rows(own) as never);
    if (sql.includes('cf.is_public = true')) return Promise.resolve(rows(pub) as never);
    if (sql.includes('cf.is_public = false'))
      return Promise.resolve(rows(opts.pointerCandidates ?? []) as never);
    if (sql.includes('unnest($1::text[])'))
      return Promise.resolve(rows(opts.pointerStrengths ?? []) as never);
    if (sql.includes('FROM contact_insights')) return Promise.resolve(rows(insights) as never);
    if (sql.includes('FROM "UserPhone"')) return Promise.resolve(rows([]) as never); // membership
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

  it('matches multi-word queries per word and ranks by words hit', async () => {
    // "lawyer real estate": the contact whose facts cover both concepts must
    // outrank one that only matches a single word.
    setup({
      facts: [
        { phone: '+995599000001', name: 'One-word', matched: ['occupation: lawyer'] },
        {
          phone: '+995599000002',
          name: 'Both-words',
          matched: ['occupation: lawyer', 'industry: real estate'],
        },
      ],
    });

    const result = (await searchByInsight('42', 'lawyer real estate')) as Record<string, unknown>;

    // The relevance floor (task 39): a row hitting fewer than half the concept
    // words is noise and is dropped; survivors carry their score.
    const results = result.results as Array<Record<string, unknown>>;
    expect(results).toHaveLength(1);
    expect(results[0].name).toBe('Both-words');
    expect(results[0].score).toBe(1);
  });

  it('returns an honest found:false when nothing clears the relevance floor', async () => {
    // Every row hits only one of four concept words — the German-export case:
    // 31 crypto advisers used to come back as "found".
    setup({
      facts: [{ phone: '+995599000003', name: 'Crypto Adviser', matched: ['industry: crypto'] }],
    });

    const result = (await searchByInsight('42', 'german companies export deals crypto')) as Record<
      string,
      unknown
    >;

    expect(result.found).toBe(false);
  });

  it('sends one LIKE parameter per query word', async () => {
    setup({ facts: [], insights: [] });

    await searchByInsight('42', 'lawyer estate');

    // Own-facts call params: [userId, userId, '%lawyer%', '%estate%', LIMIT]
    const ownCall = mockQuery.mock.calls.find((c) =>
      (c[0] as string).includes('cf.submitted_by_user_id = $1'),
    );
    expect(ownCall?.[1] as string[]).toEqual(expect.arrayContaining(['%lawyer%', '%estate%']));
  });

  it('ranks by words-hit INSIDE the SQL, before the LIMIT cuts the page', async () => {
    setup({ facts: [], insights: [] });

    await searchByInsight('42', 'GITA chairman');

    // Without in-SQL ordering the LIMIT took an arbitrary 20 of all matches and
    // the best hit (every word matched) could be dropped before ranking ran.
    const ownCall = mockQuery.mock.calls.find((c) =>
      (c[0] as string).includes('cf.submitted_by_user_id = $1'),
    );
    const publicCall = mockQuery.mock.calls.find((c) =>
      (c[0] as string).includes('cf.is_public = true'),
    );
    for (const call of [ownCall, publicCall]) {
      const sql = call?.[0] as string;
      expect(sql).toContain('bool_or(');
      expect(sql).toMatch(/ORDER BY \(.*bool_or.*\) DESC, MAX\(cf\.created_at\) DESC/s);
      expect(sql.indexOf('ORDER BY')).toBeLessThan(sql.indexOf('LIMIT'));
    }
  });

  it('T15 fallback (task 10): the empty case surfaces single-source POINTERS — strength only, never the fact text or author', async () => {
    setup({
      pointerCandidates: [{ phone: '+995599888888', name: 'დათო მეზობელი' }],
      pointerStrengths: [{ phone: '+995599888888', strength: 0.65 }],
    });

    const result = (await searchByInsight('42', 'deep sea fishing')) as Record<string, unknown>;

    expect(result.found).toBe(false);
    const pointers = result.pointers as Array<Record<string, unknown>>;
    expect(pointers).toEqual([
      { contact_id: '+995599888888', name: 'დათო მეზობელი', signal_strength: 0.65 },
    ]);
    // The two rules the note must always carry, whatever its wording: say
    // nothing about the matched text, and name only the people in the list.
    expect(String(result.pointer_note)).toContain('Never say what matched');
    expect(String(result.pointer_note)).toContain('ONLY these names');
    // The pointer payload must carry no fact value and no submitter identity.
    expect(JSON.stringify(pointers)).not.toContain('submitted_by');
    // The candidate query itself excludes sensitive field types and the
    // searcher's own facts (those already ran in the main pass).
    const candidateCall = mockQuery.mock.calls.find(([sql]) =>
      (sql as string).includes('cf.is_public = false'),
    );
    expect(candidateCall?.[0]).toContain('cf.field_type != ALL($3::text[])');
    expect(candidateCall?.[0]).toContain('cf.submitted_by_user_id <> $2');
  });

  it('T15 content guard (task 32.2): a private note carrying an accusation never makes its subject a pointer', async () => {
    setup({
      pointerCandidates: [
        { phone: '+995599888888', name: 'დათო მეზობელი', matched_text: 'note: ის ქურდია' },
        { phone: '+995599777777', name: 'ნინო ხელოსანი', matched_text: 'note: კარგი მეთევზეა' },
      ],
      pointerStrengths: [
        { phone: '+995599888888', strength: 0.9 },
        { phone: '+995599777777', strength: 0.4 },
      ],
    });

    const result = (await searchByInsight('42', 'deep sea fishing')) as Record<string, unknown>;

    // The accused person is gone even though their signal was the stronger one.
    expect(result.pointers).toEqual([
      { contact_id: '+995599777777', name: 'ნინო ხელოსანი', signal_strength: 0.4 },
    ]);
    expect(JSON.stringify(result)).not.toContain('ქურდ');
  });

  it('T15 content guard: a query that IS the accusation gets no pointers at all', async () => {
    setup({
      pointerCandidates: [{ phone: '+995599888888', name: 'დათო მეზობელი', matched_text: 'x' }],
      pointerStrengths: [{ phone: '+995599888888', strength: 0.9 }],
    });

    const result = (await searchByInsight('42', 'ვინ არის ქურდი')) as Record<string, unknown>;

    expect(result).not.toHaveProperty('pointers');
    // The candidate query is never even issued — nothing to leak, nothing to log.
    expect(
      mockQuery.mock.calls.some(([sql]) => (sql as string).includes('cf.is_public = false')),
    ).toBe(false);
  });

  it('T15 fallback: no pointers when no private signal exists — the plain honest found:false', async () => {
    setup({});

    const result = (await searchByInsight('42', 'deep sea fishing')) as Record<string, unknown>;

    expect(result.found).toBe(false);
    expect(result).not.toHaveProperty('pointers');
  });

  it("matches on the searcher's OWN hidden fact but never prints its text", async () => {
    // Ticket 9 Task 15. Cross-account the wall already held — account B
    // searching a word from account A's matchable note got a bare pointer
    // (proved live, 2 Sep). What leaked was the author's own note back to
    // themselves, which the assistant then quoted into the reply.
    setup({});
    await searchByInsight('42', 'ნაცნობი');

    const ownCall = mockQuery.mock.calls.find((c) =>
      (c[0] as string).includes('cf.submitted_by_user_id = $1'),
    );
    const sql = ownCall?.[0] as string;
    expect(sql).toContain('WHEN cf.is_public THEN');
    expect(sql).toContain('matched, not shown');
    // The public path is untouched — a public fact still prints its value.
    const publicCall = mockQuery.mock.calls.find((c) =>
      (c[0] as string).includes('cf.is_public = true'),
    );
    expect(publicCall?.[0] as string).not.toContain('matched, not shown');
  });

  it('a redacted own fact still finds the person — the count comes from SQL', async () => {
    // Redacting the text alone dropped the row under the relevance floor and
    // the person disappeared from their own search. The hit count is made in
    // SQL, before the text is hidden, and travels as its own column.
    setup({
      facts: [
        {
          phone: '+995599777777',
          name: 'დათო',
          matched: ['note: [your own hidden note — matched, not shown]'],
          sql_hits: 1,
        },
      ],
    });

    const result = (await searchByInsight('42', 'ნაცნობი')) as Record<string, unknown>;

    expect(result.found).toBe(true);
    const rows = result.results as Array<Record<string, unknown>>;
    expect(rows[0].name).toBe('დათო');
    // The person is found; the note's words are not in the answer.
    expect(JSON.stringify(rows)).not.toContain('ნინო');
  });

  it('returns found: false when neither source matches', async () => {
    setup({ facts: [], insights: [] });

    const result = (await searchByInsight('42', 'nothing')) as Record<string, unknown>;

    expect(result.found).toBe(false);
    expect(result.query).toBe('nothing');
  });

  it('still returns own facts when the insights query fails (isolated sources)', async () => {
    // The prod bug: the contact_insights scan timed out and took the facts
    // channel down with it. Sources are now isolated — facts must survive.
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    setup({ facts: [{ phone: '+995599777777', name: 'Nino', matched: ['employer: MKD Law'] }] });
    mockQuery.mockImplementation((sql: string) => {
      if (sql.includes('cf.submitted_by_user_id = $1')) {
        return Promise.resolve(
          rows([{ phone: '+995599777777', name: 'Nino', matched: ['employer: MKD Law'] }]) as never,
        );
      }
      if (sql.includes('cf.is_public = true')) return Promise.resolve(rows([]) as never);
      if (sql.includes('FROM contact_insights')) {
        return Promise.reject(new Error('statement timeout'));
      }
      if (sql.includes('FROM "UserPhone"')) return Promise.resolve(rows([]) as never); // membership
      throw new Error(`Unexpected query: ${sql}`);
    });

    const result = (await searchByInsight('42', 'MKD Law')) as Record<string, unknown>;

    expect(result.found).toBe(true);
    expect((result.results as Array<Record<string, unknown>>)[0].name).toBe('Nino');
    consoleSpy.mockRestore();
  });

  it('still returns own facts when the public-facts scan fails (the save→search loop)', async () => {
    // Precisely the reported prod symptom: save a fact, then search it. Even if
    // the crowd/public-facts scan times out, the user's OWN fact must surface.
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    mockQuery.mockImplementation((sql: string) => {
      if (sql.includes('cf.submitted_by_user_id = $1')) {
        return Promise.resolve(
          rows([
            { phone: '+995599777777', name: 'Mariam', matched: ['employer: MKD Law'] },
          ]) as never,
        );
      }
      if (sql.includes('cf.is_public = true'))
        return Promise.reject(new Error('statement timeout'));
      if (sql.includes('FROM contact_insights')) return Promise.resolve(rows([]) as never);
      if (sql.includes('FROM "UserPhone"')) return Promise.resolve(rows([]) as never); // membership
      throw new Error(`Unexpected query: ${sql}`);
    });

    const result = (await searchByInsight('42', 'MKD Law')) as Record<string, unknown>;

    expect(result.found).toBe(true);
    expect((result.results as Array<Record<string, unknown>>)[0].name).toBe('Mariam');
    consoleSpy.mockRestore();
  });

  it('degrades to found:false (no throw) when both sources fail', async () => {
    mockQuery.mockRejectedValue(new Error('query timeout') as never);
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    const result = (await searchByInsight('42', 'test')) as Record<string, unknown>;

    expect(result.found).toBe(false);
    consoleSpy.mockRestore();
  });
});
