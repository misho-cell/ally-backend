jest.mock('../../../db/postgres/client', () => ({ query: jest.fn(), __esModule: true }));
jest.mock('../../../db/neo4j/client', () => ({ getSession: jest.fn(), __esModule: true }));
jest.mock('../../neo4j.keys', () => ({ getCompositeKeyForUser: jest.fn(), __esModule: true }));
jest.mock('../../block.service', () => ({ getExcludedPhones: jest.fn(), __esModule: true }));

import { query } from '../../../db/postgres/client';
import { getSession } from '../../../db/neo4j/client';
import { getCompositeKeyForUser } from '../../neo4j.keys';
import { getExcludedPhones } from '../../block.service';
import { searchSecondDegree } from '../searchSecondDegree';

const mockQuery = query as jest.MockedFunction<typeof query>;
const mockGetSession = getSession as jest.MockedFunction<typeof getSession>;
const mockGetKey = getCompositeKeyForUser as jest.MockedFunction<typeof getCompositeKeyForUser>;
const mockExcluded = getExcludedPhones as jest.MockedFunction<typeof getExcludedPhones>;

const FRIEND_PHONE = '+995500000009';

function record(fields: Record<string, unknown>): { get: (k: string) => unknown } {
  return { get: (k: string) => fields[k] };
}

function rows(data: unknown[]): { rows: unknown[]; rowCount: number } {
  return { rows: data, rowCount: data.length };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockExcluded.mockResolvedValue([]);
  mockGetKey.mockResolvedValue('+995500000000');
  mockGetSession.mockReturnValue({
    run: jest.fn().mockResolvedValue({ records: [record({ phoneKey: FRIEND_PHONE })] }),
    close: jest.fn().mockResolvedValue(undefined),
  } as never);
});

describe('searchSecondDegree tag matching', () => {
  it('matches tags and aliases by word-start regex on the RAW text (no fold)', async () => {
    mockQuery.mockResolvedValue(
      rows([
        { phone: '+995500000123', target_user_id: null, name: 'Nino', via_names: ['Gio'] },
      ]) as never,
    );

    await searchSecondDegree('42', 'buralteri');

    // The weak-tie signal INSERT fires first — find the main query by fragment.
    const mainCall = mockQuery.mock.calls.find((c) => (c[0] as string).includes('tag_hits'));
    const [sql, params] = mainCall as [string, unknown[]];
    // Word-start on the RAW text for tags and aliases alike — the normalize
    // fold is OUT of second-degree (Khazaradze matched "kasradze"; 'axel'
    // folded to '%akel%' and exploded every trigram path). The (|| '')
    // wrapper keeps every filter non-indexable so the LATERAL contactId
    // probes are the only plan.
    expect(sql).toContain(`(LOWER(ut.tag) || '') ~ $3`);
    expect(sql).toContain(`(LOWER(ua_m.alias) || '') ~ $3`);
    expect(sql).not.toContain('normalize_search_token');
    expect(sql).toContain('JOIN LATERAL');
    // $3 = word-start regex, $4 = blocked phones, $5 = userId again as TEXT
    // (the contact_facts role lookup — $1 is inferred int by the joins).
    expect(params).toEqual(['42', [FRIEND_PHONE], '\\mburalteri', [], '42']);
  });

  it('ranks before decorating: display joins hang off the LIMITed ranked set', async () => {
    mockQuery.mockResolvedValue(rows([]) as never);

    await searchSecondDegree('42', 'buralteri');

    const sql = mockQuery.mock.calls.find((c) =>
      (c[0] as string).includes('tag_hits'),
    )?.[0] as string;
    // The ranking CTE carries its own LIMIT, and the display tables join FROM
    // it — never onto the unbounded match set (the 6 Aug timeout shape).
    expect(sql).toMatch(/ranked AS \([\s\S]*LIMIT 30[\s\S]*\)\s*SELECT r\.phone/);
    expect(sql).toContain('FROM ranked r');
  });

  it('carries a Georgian query cross-script via per-script variants', async () => {
    mockQuery.mockResolvedValue(rows([]) as never);

    await searchSecondDegree('42', 'ბუღალტერი');

    const mainCall = mockQuery.mock.calls.find((c) => (c[0] as string).includes('tag_hits'));
    const params = mainCall?.[1] as unknown[];
    // buildSearchTerms transliterates the Georgian query to its Latin form(s);
    // each variant arrives as its own word-start regex.
    expect(params.some((p) => typeof p === 'string' && p.includes('bughalteri'))).toBe(true);
  });

  it('records a weak-tie signal before searching (path asked to an own contact)', async () => {
    mockQuery.mockResolvedValue(rows([]) as never);

    await searchSecondDegree('42', 'buralteri');

    const insertCall = mockQuery.mock.calls.find((c) =>
      (c[0] as string).includes('INSERT INTO weak_tie_signals'),
    );
    expect(insertCall).toBeDefined();
    expect(insertCall?.[0] as string).toContain('ON CONFLICT (user_id, contact_phone) DO NOTHING');
    expect((insertCall?.[1] as unknown[])[0]).toBe('42');
  });

  it('down-ranks weak-tie vias in the bridge ordering', async () => {
    mockQuery.mockResolvedValue(rows([]) as never);

    await searchSecondDegree('42', 'buralteri');

    const mainSql = mockQuery.mock.calls.find((c) =>
      (c[0] as string).includes('tag_hits'),
    )?.[0] as string;
    expect(mainSql).toContain('LEFT JOIN weak_tie_signals w');
    expect(mainSql).toContain('COUNT(DISTINCT fu."userId") - COUNT(DISTINCT w.user_id)');
  });

  it('warm bridges rank above cold ones and warmth is surfaced as via_warmth', async () => {
    mockQuery.mockImplementation((sql: string) => {
      // D34's relationship read must stay empty here — this test is about the
      // enrichment-computed warmth alone.
      if (sql.includes('contact_relationships')) return Promise.resolve(rows([]) as never);
      return Promise.resolve(
        rows([
          {
            phone: '+995500000123',
            target_user_id: null,
            name: 'Nino',
            via_names: ['Gio'],
            warmth: 0.85,
          },
          { phone: '+995500000124', target_user_id: 7, name: 'Dato', via_names: ['Keti'] },
        ]) as never,
      );
    });

    const result = (await searchSecondDegree('42', 'buralteri')) as Record<string, unknown>;

    const mainSql = mockQuery.mock.calls.find((c) =>
      (c[0] as string).includes('tag_hits'),
    )?.[0] as string;
    // The bridge's own enrichment-computed tie to the target breaks mutual-count
    // ties: a warm via outranks a cold one.
    expect(mainSql).toContain('LEFT JOIN contact_relationship_scores crs');
    expect(mainSql).toContain('MAX(crs.strength_score) DESC NULLS LAST');
    const results = result.results as Array<Record<string, unknown>>;
    expect(results[0].via_warmth).toBe(0.85);
    expect(results[1]).not.toHaveProperty('via_warmth');
  });

  it('T15: attaches signal_strength from private+public tags/facts, and NEVER the matched word itself', async () => {
    mockQuery.mockImplementation((sql: string) => {
      if (sql.includes('tag_hits')) {
        return Promise.resolve(
          rows([
            { phone: '+995500000123', target_user_id: null, name: 'Nino', via_names: ['Gio'] },
          ]) as never,
        );
      }
      if (sql.includes('unnest($1::text[])')) {
        return Promise.resolve(rows([{ phone: '+995500000123', strength: 0.65 }]) as never);
      }
      return Promise.resolve(rows([]) as never);
    });

    const result = (await searchSecondDegree('42', 'xelosani')) as Record<string, unknown>;

    const results = result.results as Array<Record<string, unknown>>;
    expect(results[0].signal_strength).toBe(0.65);
    // The whole point of T15: the payload carries a NUMBER, never the tag or
    // fact text that produced it — those never left the SQL layer.
    expect(JSON.stringify(result)).not.toMatch(/xelosan/i);
  });

  it('T15: never lets a sensitive-category fact (health/money/politics/religion/love life) contribute to the score — the 20 Aug spec, verbatim', async () => {
    mockQuery.mockImplementation((sql: string) => {
      if (sql.includes('tag_hits')) {
        return Promise.resolve(
          rows([
            { phone: '+995500000123', target_user_id: null, name: 'Nino', via_names: ['Gio'] },
          ]) as never,
        );
      }
      if (sql.includes('unnest($1::text[])')) {
        return Promise.resolve(rows([{ phone: '+995500000123', strength: 0 }]) as never);
      }
      return Promise.resolve(rows([]) as never);
    });

    await searchSecondDegree('42', 'xelosani');

    const signalCall = mockQuery.mock.calls.find((c) =>
      (c[0] as string).includes('unnest($1::text[])'),
    );
    const [sql, params] = signalCall as [string, unknown[]];
    expect(sql).toContain('field_type != ALL(');
    const excludedTypes = params[params.length - 1] as string[];
    expect(excludedTypes).toEqual(
      expect.arrayContaining(['health', 'money', 'politics', 'religion', 'love']),
    );
    // 'note' left the category denylist on 1 Sep — the founder's third state
    // is precisely about notes, and each one now carries its own verdict. What
    // replaces the blanket ban is the visibility gate below: a note that was
    // never cleared to travel cannot move anyone's score.
    expect(excludedTypes).not.toContain('note');
    expect(sql).toContain('cf.is_public OR cf.is_matchable');
  });

  it('D34: a relationship edge the searcher owns lifts via_warmth — and the relation itself never appears', async () => {
    mockQuery.mockImplementation((sql: string) => {
      if (sql.includes('contact_relationships'))
        return Promise.resolve(rows([{ phone: '+995500000123' }]) as never);
      if (sql.includes('tag_hits'))
        return Promise.resolve(
          rows([
            {
              phone: '+995500000123',
              target_user_id: null,
              name: 'Nino',
              via_names: ['Gio'],
              warmth: 0.6,
            },
            { phone: '+995500000124', target_user_id: 7, name: 'Dato', via_names: ['Keti'] },
          ]) as never,
        );
      return Promise.resolve(rows([]) as never);
    });

    const result = (await searchSecondDegree('42', 'buralteri')) as Record<string, unknown>;

    const results = result.results as Array<Record<string, unknown>>;
    // 0.6 + 0.2 bonus, capped at 0.95.
    expect(results[0].via_warmth).toBeCloseTo(0.8, 5);
    // The untouched row keeps no warmth; and NOTHING in the payload names the
    // relation — the edge only exists as a number.
    expect(results[1]).not.toHaveProperty('via_warmth');
    expect(JSON.stringify(result)).not.toContain('relation');
  });

  it('T15: omits signal_strength entirely when nothing (public or private) matched', async () => {
    mockQuery.mockImplementation((sql: string) => {
      if (sql.includes('tag_hits')) {
        return Promise.resolve(
          rows([
            { phone: '+995500000123', target_user_id: null, name: 'Nino', via_names: ['Gio'] },
          ]) as never,
        );
      }
      if (sql.includes('unnest($1::text[])')) {
        return Promise.resolve(rows([{ phone: '+995500000123', strength: 0 }]) as never);
      }
      return Promise.resolve(rows([]) as never);
    });

    const result = (await searchSecondDegree('42', 'xelosani')) as Record<string, unknown>;

    const results = result.results as Array<Record<string, unknown>>;
    expect(results[0]).not.toHaveProperty('signal_strength');
  });

  it('T15: a failure in the signal-strength lookup never breaks the search itself', async () => {
    mockQuery.mockImplementation((sql: string) => {
      if (sql.includes('tag_hits')) {
        return Promise.resolve(
          rows([
            { phone: '+995500000123', target_user_id: null, name: 'Nino', via_names: ['Gio'] },
          ]) as never,
        );
      }
      if (sql.includes('unnest($1::text[])')) {
        return Promise.reject(new Error('db blip'));
      }
      return Promise.resolve(rows([]) as never);
    });

    const result = (await searchSecondDegree('42', 'xelosani')) as Record<string, unknown>;

    expect(result.found).toBe(true);
    const results = result.results as Array<Record<string, unknown>>;
    expect(results[0]).not.toHaveProperty('signal_strength');
  });

  it('returns found:false when the graph has no contacts', async () => {
    mockGetSession.mockReturnValue({
      run: jest.fn().mockResolvedValue({ records: [] }),
      close: jest.fn().mockResolvedValue(undefined),
    } as never);

    const result = (await searchSecondDegree('42', 'buralteri')) as Record<string, unknown>;

    expect(result.found).toBe(false);
    expect(mockQuery).not.toHaveBeenCalled();
  });
});
