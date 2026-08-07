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
  it('matches tags with the index-backed % operator + similarity refine', async () => {
    mockQuery.mockResolvedValue(
      rows([
        { phone: '+995500000123', target_user_id: null, name: 'Nino', via_names: ['Gio'] },
      ]) as never,
    );

    await searchSecondDegree('42', 'buralteri');

    // The weak-tie signal INSERT fires first — find the main query by fragment.
    const mainCall = mockQuery.mock.calls.find((c) =>
      (c[0] as string).includes('normalize_search_token(ut.tag)'),
    );
    const [sql, params] = mainCall as [string, unknown[]];
    // Index-backed trigram match, not a bare similarity() scan.
    expect(sql).toContain('normalize_search_token(ut.tag) % normalize_search_token($3)');
    expect(sql).toContain('>= 0.45');
    // Aliases: RAW-LIKE gate (norm-folding regressed 'axel' → '%akel%') plus
    // a WORD-START regex refine (substring alone matched every mid-word
    // "…gita…" alias — the 6 Aug second-degree timeout).
    expect(sql).toContain(`LOWER(ua_m.alias) LIKE $4`);
    expect(sql).toContain(`(LOWER(ua_m.alias) || '') ~ $5`);
    // $3 = tag term, $4 = alias LIKE gate, $5 = word-start regex, $6 = blocked.
    expect(params).toEqual([
      '42',
      [FRIEND_PHONE],
      'buralteri',
      '%buralteri%',
      '\\mburalteri',
      [],
    ]);
  });

  it('ranks before decorating: display joins hang off the LIMITed ranked set', async () => {
    mockQuery.mockResolvedValue(rows([]) as never);

    await searchSecondDegree('42', 'buralteri');

    const sql = mockQuery.mock.calls.find((c) =>
      (c[0] as string).includes('normalize_search_token(ut.tag)'),
    )?.[0] as string;
    // The ranking CTE carries its own LIMIT, and the display tables join FROM
    // it — never onto the unbounded match set (the 6 Aug timeout shape).
    expect(sql).toMatch(/ranked AS \([\s\S]*LIMIT 30[\s\S]*\)\s*SELECT r\.phone/);
    expect(sql).toContain('FROM ranked r');
  });

  it('normalizes a Georgian query the same way the index is built (via transliteration)', async () => {
    mockQuery.mockResolvedValue(rows([]) as never);

    await searchSecondDegree('42', 'ბუღალტერი');

    const mainCall = mockQuery.mock.calls.find((c) =>
      (c[0] as string).includes('normalize_search_token(ut.tag)'),
    );
    const params = mainCall?.[1] as string[];
    // buildSearchTerms transliterates the Georgian query to its Latin form(s),
    // which normalize_search_token then folds to the canonical token in-SQL.
    expect(params).toContain('bughalteri');
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
      (c[0] as string).includes('normalize_search_token(ut.tag)'),
    )?.[0] as string;
    expect(mainSql).toContain('LEFT JOIN weak_tie_signals w');
    expect(mainSql).toContain('COUNT(DISTINCT fu."userId") - COUNT(DISTINCT w.user_id)');
  });

  it('warm bridges rank above cold ones and warmth is surfaced as via_warmth', async () => {
    mockQuery.mockResolvedValue(
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

    const result = (await searchSecondDegree('42', 'buralteri')) as Record<string, unknown>;

    const mainSql = mockQuery.mock.calls.find((c) =>
      (c[0] as string).includes('normalize_search_token(ut.tag)'),
    )?.[0] as string;
    // The bridge's own enrichment-computed tie to the target breaks mutual-count
    // ties: a warm via outranks a cold one.
    expect(mainSql).toContain('LEFT JOIN contact_relationship_scores crs');
    expect(mainSql).toContain('MAX(crs.strength_score) DESC NULLS LAST');
    const results = result.results as Array<Record<string, unknown>>;
    expect(results[0].via_warmth).toBe(0.85);
    expect(results[1]).not.toHaveProperty('via_warmth');
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
