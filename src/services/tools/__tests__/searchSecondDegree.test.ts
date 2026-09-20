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
    // folded to '%akel%' and exploded every trigram path).
    //
    // The `|| ''` wrapper that used to sit on these is gone. It was there to
    // keep every filter non-indexable so the LATERAL contactId probes were the
    // only plan; measured on 16 September that cost 6017 ms against 692 ms for
    // the same 416 rows. It did not make the plan predictable, it removed the
    // planner's choice. What actually guards against the gita finding is the
    // `\m` word-start on raw text, asserted below, and that is unchanged.
    //
    // The FILTER is now one alternation parameter rather than one condition per
    // word (row 108, second measurement: 7,850 ms -> 4,590 ms on the whole
    // query, same rows both ways). The per-word patterns are still sent — they
    // are what word_hits counts with — so a one-word query sends its pattern
    // twice, which is why $3 and $4 are equal below.
    expect(sql).toContain(`LOWER(ut.tag) ~ $4`);
    expect(sql).toContain(`LOWER(ua_m.alias) ~ $4`);
    expect(sql).toContain(`bool_or(label ~ $3)`);
    expect(sql).not.toContain(`|| '') ~`);
    expect(sql).not.toContain('normalize_search_token');
    expect(sql).toContain('JOIN LATERAL');
    // $3 = word-start regex (word_hits), $4 = the same words as ONE alternation
    // (the filter), $5 = the TRIGRAM PRE-FILTER, one `%word%` per word (row
    // 108's fifth cut — the regex still decides, this only lets the GIN index
    // skip rows that cannot match), $6 = blocked phones, $7 = userId again as
    // TEXT (the contact_facts role lookup — $1 is inferred int by the joins),
    // $8/$9 = where the title and the employer may come from, in preference
    // order (ticket 9 task 25: 'role' was never read and holds 96 public rows).
    expect(params).toEqual([
      '42',
      [FRIEND_PHONE],
      '\\mburalteri',
      '\\mburalteri',
      '%buralteri%',
      [],
      '42',
      ['role', 'occupation'],
      ['employer', 'affiliation'],
    ]);
  });

  it('collapses several words into ONE filter regex, and still counts them apart', async () => {
    // Row 108. Nine conditions over 605,086 tag rows is nine regex passes per
    // row; one alternation is a single pass testing the same alternatives.
    mockQuery.mockResolvedValue(rows([]) as never);

    await searchSecondDegree('42', 'buralteri marketing');

    const mainCall = mockQuery.mock.calls.find((c) => (c[0] as string).includes('tag_hits'));
    const [sql, params] = mainCall as [string, unknown[]];
    // Sliced by SHAPE rather than by a magic offset, because the parameter
    // list grew by one-per-word when the pre-filter arrived and every fixed
    // offset in this file broke at once. The regexes are the `\\m…` ones and
    // the pre-filter patterns are the `%…%` ones; the alternation is the one
    // string carrying a bar.
    const all = params as string[];
    const words = all.filter(
      (v) => typeof v === 'string' && v.startsWith('\\m') && !v.includes('|'),
    );
    const filter = all.find((v) => typeof v === 'string' && v.includes('|')) as string;
    const prefilter = all.filter((v) => typeof v === 'string' && /^%.*%$/.test(v));

    // Every word reaches the filter, joined by a bar and nothing else.
    expect(filter).toBe(words.join('|'));
    expect(words.length).toBeGreaterThan(1);
    // One REGEX condition per column, not one per word.
    expect(sql.match(/LOWER\(ut\.tag\) ~ \$/g)).toHaveLength(1);
    expect(sql.match(/LOWER\(ua_m\.alias\) ~ \$/g)).toHaveLength(1);
    // And one pre-filter pattern per word, in front of it. They are a strict
    // superset of the regex, so they can only remove rows it would reject too.
    expect(prefilter).toEqual(['%buralteri%', '%marketing%', '%marqeting%']);
    expect(sql).toContain('LIKE $');
    // And the words are still counted separately, which is what the ranking
    // needs: a person carrying both query words must outrank one carrying one.
    // Two groups, written twice — once in the select list and once in the
    // ORDER BY that feeds the LIMIT — so four.
    expect(sql.match(/bool_or\(/g)).toHaveLength(4);
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
    //
    // `bughalter` and not `bughalteri` since 19 September: the Georgian case
    // ending is trimmed and the stem stands in for the inflected word. As a
    // word-START pattern the shorter one reaches every accountant the longer
    // one did, plus the ones saved as „ბუღალტერს" or „ბუღალტრები".
    expect(params.some((p) => typeof p === 'string' && p.includes('bughalter'))).toBe(true);
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

describe('second-degree title and employer (ticket 9 task 25)', () => {
  it("reads the title from 'role' first, then 'occupation', and prefers in that order", async () => {
    mockQuery.mockResolvedValue(rows([]) as never);

    await searchSecondDegree('42', 'buralteri');

    const call = mockQuery.mock.calls.find((c) => (c[0] as string).includes('tag_hits'));
    const [sql, params] = call as [string, unknown[]];
    // The INDEX is derived rather than written down. Every fixed offset in
    // this file broke at once when the pre-filter added one parameter per
    // word, and a test that has to be renumbered on every parameter change is
    // a test that will one day be renumbered wrongly.
    const titleIdx = params.findIndex((v) => Array.isArray(v) && v[0] === 'role') + 1;
    const employerIdx = params.findIndex((v) => Array.isArray(v) && v[0] === 'employer') + 1;
    expect(titleIdx).toBeGreaterThan(0);
    expect(employerIdx).toBe(titleIdx + 1);
    expect(sql).toContain(`AND cf.field_type = ANY($${titleIdx}::text[])`);
    expect(sql).toContain(`ORDER BY array_position($${titleIdx}::text[], cf.field_type)`);
    expect(sql).toContain(`AND cf.field_type = ANY($${employerIdx}::text[])`);
    expect(sql).toContain(`ORDER BY array_position($${employerIdx}::text[], cf.field_type)`);
  });

  it('never reads a fact that is neither public nor the searcher own', async () => {
    mockQuery.mockResolvedValue(rows([]) as never);

    await searchSecondDegree('42', 'buralteri');

    const call = mockQuery.mock.calls.find((c) => (c[0] as string).includes('tag_hits'));
    const [sql, params] = call as [string, unknown[]];
    // Derived, for the same reason as above: it is the userId sent a SECOND
    // time as text, immediately before the two field lists.
    const textUserIdx = params.findIndex((v) => Array.isArray(v) && v[0] === 'role');
    // Both lookups carry the same privacy scope.
    expect(
      sql.match(new RegExp(`cf\\.is_public OR cf\\.submitted_by_user_id = \\$${textUserIdx}`, 'g')),
    ).toHaveLength(2);
  });
});

/**
 * Ticket 20 row 110 — the friends-of-friends search treated a phrase as one tag.
 *
 * buildSearchTerms puts the WHOLE query in as a single term and never splits on
 * whitespace, so search_second_degree("marketing agency") asked for a tag whose
 * word-start match is that literal phrase. Measured on the live base:
 *
 *   "marketing agency"  as a phrase    0 people
 *   "marketing"         as a word  2,892 people
 *   "agency"            as a word    694 people
 *
 * Every multi-word second-degree search in the tester's reports — "eco
 * marketing", "green startup marketing", "marketing agency", "ლეპტოპი შეკეთება"
 * — was asking for something nobody writes in a phonebook, and correctly
 * finding nobody.
 *
 * The splitter already existed and search_by_tag already used it. One of the
 * two searches learned about phrases and the other never did.
 */
describe('Ticket 20 row 110: a multi-word query is words, not a phrase', () => {
  function mainSql(): string {
    const call = mockQuery.mock.calls.find((c) => (c[0] as string).includes('tag_hits'));
    return (call as [string, unknown[]])[0];
  }
  function mainParams(): unknown[] {
    const call = mockQuery.mock.calls.find((c) => (c[0] as string).includes('tag_hits'));
    return (call as [string, unknown[]])[1];
  }

  it('sends a pattern per WORD, not one for the whole phrase', async () => {
    await searchSecondDegree('501', 'marketing agency');

    const params = mainParams();
    const patterns = params.slice(2).filter((p): p is string => typeof p === 'string');
    // Each word contributes its own word-start pattern; no parameter is the
    // two words glued together.
    expect(patterns.some((p) => p.includes('marketing'))).toBe(true);
    expect(patterns.some((p) => p.includes('agency'))).toBe(true);
    expect(patterns.some((p) => p.includes('marketing agency'))).toBe(false);
  });

  it('counts how many DISTINCT words each person matched', async () => {
    await searchSecondDegree('501', 'marketing agency');

    const sql = mainSql();
    // One bool_or per word, summed — the shape wordMatch.ts uses for the tag
    // search, so the two searches rank the same way.
    expect(sql).toContain('bool_or(');
    expect(sql).toMatch(/bool_or\([^)]*\)::int \+ bool_or\(/);
    expect(sql).toContain('AS word_hits');
  });

  it('ranks the people carrying BOTH words above those carrying one', async () => {
    await searchSecondDegree('501', 'marketing agency');

    const sql = mainSql();
    // Before bridge_rank and before warmth: matching the query beats being
    // well-connected. Without this the commoner word would swamp the rarer one,
    // which is worse than today's zero.
    expect(sql).toMatch(/ORDER BY r\.word_hits DESC, r\.bridge_rank DESC/);
  });

  it('a single word still behaves as one group — nothing changes for it', async () => {
    await searchSecondDegree('501', 'marketing');

    const sql = mainSql();
    // One group means one bool_or and no addition.
    expect(sql).toContain('bool_or(');
    expect(sql).not.toMatch(/bool_or\([^)]*\)::int \+ bool_or\(/);
  });

  it('the matched label never leaves the CTE', async () => {
    await searchSecondDegree('501', 'marketing agency');

    const sql = mainSql();
    // It rides as far as word_hits and no further: the outer select groups by
    // phone and joins names. A phonebook label reaching a reply is the thing
    // this containment exists to prevent.
    expect(sql).toContain('AS label');
    expect(sql).not.toMatch(/SELECT[^;]*r\.label/);
  });
});

/**
 * Row 108, fifth cut — the trigram pre-filter in front of the regex.
 *
 * Measured on the live base, account 501, 306 bridges, 605,086 tag rows and
 * 280,856 alias rows, alternating the ORDER each round so the winner is not
 * whichever ran second:
 *
 *   COLD, first read of the day    12,517 ms  ->   999 ms   169 rows both
 *   rare      5 patterns            3,000 ms  ->   660 ms   169 rows both
 *   common    4 patterns (xelosan)  2,285 ms  -> 1,916 ms  1112 rows both
 *   very common 2 patterns (deda)   1,710 ms  -> 1,600 ms   776 rows both
 *   nine patterns (accountant)      5,028 ms  -> 3,828 ms  1000 rows both
 *
 * This candidate was rejected on 18 September — „7x SLOWER on a common one" —
 * on the LATERAL shape the query no longer uses, the same provenance as the
 * alternation verdict that was already retracted. It does not reproduce.
 */
describe('the pre-filter in front of the regex', () => {
  it('sends one %word% per word, and still lets the regex decide', async () => {
    mockQuery.mockResolvedValue(rows([]) as never);

    await searchSecondDegree('42', 'buralteri marketing');

    const [sql, params] = mockQuery.mock.calls.find((c) =>
      (c[0] as string).includes('tag_hits'),
    ) as [string, unknown[]];
    const prefilter = (params as string[]).filter((v) => typeof v === 'string' && /^%.*%$/.test(v));
    expect(prefilter).toEqual(['%buralteri%', '%marketing%', '%marqeting%']);
    // The regex is still there and still one per column: the LIKE narrows the
    // rows the index has to read, it does not decide what matches.
    expect(sql.match(/LOWER\(ut\.tag\) ~ \$/g)).toHaveLength(1);
    expect(sql.match(/LOWER\(ua_m\.alias\) ~ \$/g)).toHaveLength(1);
    expect(sql).toMatch(/LIKE \$\d+ OR LOWER\(ut\.tag\) LIKE \$\d+/);
  });

  /**
   * A term under three characters cannot use a trigram index, and ONE
   * unindexable branch costs the whole OR chain its index while still looking
   * like a pre-filter. Every pattern becomes `%` — true of everything, so the
   * filter is inert and the regex decides exactly as before.
   *
   * The parameter list keeps its length either way. A list that changes shape
   * under you is how the `integer = text` P0 happened, and that lesson is
   * written above the filter in the source.
   */
  it('goes inert — but stays the same length — when a word is too short to index', async () => {
    mockQuery.mockResolvedValue(rows([]) as never);

    await searchSecondDegree('42', 'hr');

    const params = (
      mockQuery.mock.calls.find((c) => (c[0] as string).includes('tag_hits')) as [string, unknown[]]
    )[1] as string[];
    // `%` alone, not `%hr%` — the pattern that matches everything.
    const prefilter = params.filter((v) => typeof v === 'string' && v.startsWith('%'));
    expect(prefilter.length).toBeGreaterThan(0);
    expect(prefilter.every((p) => p === '%')).toBe(true);
  });

  it('escapes a wildcard in the term, so a % typed by a user matches a literal %', async () => {
    mockQuery.mockResolvedValue(rows([]) as never);

    await searchSecondDegree('42', '100%cotton');

    const params = (
      mockQuery.mock.calls.find((c) => (c[0] as string).includes('tag_hits')) as [string, unknown[]]
    )[1] as string[];
    const prefilter = params.filter((v) => typeof v === 'string' && v.startsWith('%'));
    // The inner % is escaped; the surrounding ones are ours.
    expect(prefilter.some((p) => p.includes('\\%'))).toBe(true);
  });
});

/**
 * A SEARCH THAT COULD NOT FINISH IS NOT AN EMPTY NETWORK.
 *
 * Measured on tool_call_log, seven days to 20 September:
 *
 *   search_second_degree:opening   152 calls, 51 FAILED, every one
 *                                  „canceling statement due to statement
 *                                  timeout" at about 16.4 seconds
 *
 * A third of the searches that run when a goal opens. Until today all fifty-one
 * returned `{ found: false }` with the raw Postgres string attached — the same
 * shape as „nobody matched" — so the model told the person their second circle
 * had nobody, and nothing said the search had not run.
 */
describe('a search that did not finish', () => {
  it('says it TIMED OUT rather than reporting an empty network', async () => {
    mockQuery.mockRejectedValue(new Error('canceling statement due to statement timeout'));

    const out = (await searchSecondDegree('42', 'photographer')) as Record<string, unknown>;

    expect(out.found).toBe(false);
    expect(out.reason).toBe('search_timed_out');
    expect(String(out.note)).toContain('DID NOT FINISH');
    expect(String(out.note)).toContain('not an empty network');
  });

  it('forbids the two conclusions the model was drawing from it', async () => {
    mockQuery.mockRejectedValue(new Error('canceling statement due to statement timeout'));

    const out = (await searchSecondDegree('42', 'photographer')) as Record<string, unknown>;

    // „nobody was found" is the false sentence; „a route that came back empty"
    // is the false BOOKKEEPING — a plan route must not be marked exhausted by
    // a search that never ran.
    expect(String(out.note)).toContain('Do NOT tell the user nobody was found');
    expect(String(out.note)).toContain('came back empty');
  });

  it('never hands the raw database string on', async () => {
    mockQuery.mockRejectedValue(new Error('canceling statement due to statement timeout'));

    const out = (await searchSecondDegree('42', 'photographer')) as Record<string, unknown>;

    expect(JSON.stringify(out)).not.toContain('canceling statement');
    expect(out.error).toBeUndefined();
  });

  it('a fault that is NOT a timeout is still not an empty network', async () => {
    mockQuery.mockRejectedValue(new Error('connection terminated unexpectedly'));

    const out = (await searchSecondDegree('42', 'photographer')) as Record<string, unknown>;

    expect(out.reason).toBe('search_failed');
    expect(String(out.note)).toContain('DID NOT FINISH');
    expect(JSON.stringify(out)).not.toContain('connection terminated');
  });
});
