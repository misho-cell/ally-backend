jest.mock('../../../db/postgres/client', () => ({ query: jest.fn(), __esModule: true }));
jest.mock('../../block.service', () => ({
  __esModule: true,
  getExcludedPhones: jest.fn().mockResolvedValue([]),
}));

import { query } from '../../../db/postgres/client';
import { getExcludedPhones } from '../../block.service';
import { searchByTagExactOnly } from '../searchByTag';

const mockQuery = query as jest.MockedFunction<typeof query>;
const mockExcluded = getExcludedPhones as jest.MockedFunction<typeof getExcludedPhones>;

/** The exact pass fires its page and its COUNT together; nothing else should fire. */
function found(people: { phone: string; name: string | null; saved_as?: string | null }[]): void {
  mockQuery.mockImplementation((sql: string) => {
    if (String(sql).includes('COUNT'))
      return Promise.resolve({ rows: [{ count: String(people.length) }], rowCount: 1 } as never);
    return Promise.resolve({
      rows: people.map((p) => ({ all_tags: [], saved_as: null, ...p })),
      rowCount: people.length,
    } as never);
  });
}

const sqlOfEveryCall = (): string => mockQuery.mock.calls.map((c) => String(c[0])).join('\n');

beforeEach(() => {
  jest.clearAllMocks();
  mockExcluded.mockResolvedValue([]);
});

/**
 * The way-in lookup's own search — 22 September, and the number is the whole
 * argument.
 *
 * `findWaysIn` called the full `searchByTag` under a 3,000 ms budget. From
 * `tool_call_log`, account 501, the twenty-question run that morning:
 *
 *   timed out   76 lookups   p50 3,000 ms   (min 2,999, max 3,006)
 *   finished     2 lookups      2,355 and 2,762 ms
 *   real tag queries, same hour, same book    p50 3,705 ms
 *
 * A three-second ceiling over a 3.7-second median. Ninety-seven times in a
 * hundred the model was handed „we could not look", three seconds after the
 * question, having learnt nothing.
 */
describe('the way-in lookup runs the exact pass and nothing else', () => {
  it('does not run the fuzzy pass', async () => {
    found([{ phone: '+995555123456', name: 'ნინო' }]);

    await searchByTagExactOnly('501', 'Performa');

    // The fuzzy pass is pg_trgm similarity over normalize_search_token. It
    // exists for a HUMAN's typo; a web card's title is not typed by anybody,
    // and a near-spelling of one is not evidence of a way in.
    expect(sqlOfEveryCall()).not.toContain('similarity');
    expect(sqlOfEveryCall()).not.toContain('normalize_search_token');
  });

  /**
   * Facts, account states, relationship scores, exclusion scopes and human
   * tiers: five more queries per lookup, and the caller reads `results[0].name`
   * and throws the rest away.
   */
  it('fetches none of the enrichment the caller never reads', async () => {
    found([{ phone: '+995555123456', name: 'ნინო' }]);

    await searchByTagExactOnly('501', 'Performa');

    // The page and its COUNT. Nothing else.
    expect(mockQuery).toHaveBeenCalledTimes(2);
  });

  it('gives back the one thing a way-in verdict is: a name', async () => {
    found([{ phone: '+995555123456', name: 'ნინო' }]);

    const out = await searchByTagExactOnly('501', 'Performa');

    expect(out).toEqual({
      found: true,
      query: 'Performa',
      count: 1,
      results: [{ name: 'ნინო' }],
    });
  });

  it('falls back to what the owner saved them as when there is no name', async () => {
    found([{ phone: '+995555123456', name: null, saved_as: 'ნინო ბანკიდან' }]);

    const out = await searchByTagExactOnly('501', 'Performa');

    expect(out).toMatchObject({ results: [{ name: 'ნინო ბანკიდან' }] });
  });

  it('says found:false rather than an empty list, like its bigger sibling', async () => {
    found([]);

    expect(await searchByTagExactOnly('501', 'Performa')).toEqual({
      found: false,
      query: 'Performa',
    });
  });

  it('asks nothing at all of a query with no searchable word in it', async () => {
    const out = await searchByTagExactOnly('501', '   ');

    expect(out).toEqual({ found: false, query: '   ' });
    expect(mockQuery).not.toHaveBeenCalled();
  });

  /**
   * A blocked person is not a way in. The lean path drops the enrichment, not
   * the exclusions — those are a decision the owner made about a human being.
   */
  it('still leaves out a person the owner has blocked', async () => {
    mockExcluded.mockResolvedValue(['+995555123456']);
    found([
      { phone: '+995555123456', name: 'ნინო' },
      { phone: '+995555999888', name: 'გიორგი' },
    ]);

    const out = await searchByTagExactOnly('501', 'Performa');

    expect(out).toMatchObject({ count: 1, results: [{ name: 'გიორგი' }] });
  });

  it('returns found:false when the only match was blocked', async () => {
    mockExcluded.mockResolvedValue(['+995555123456']);
    found([{ phone: '+995555123456', name: 'ნინო' }]);

    expect(await searchByTagExactOnly('501', 'Performa')).toEqual({
      found: false,
      query: 'Performa',
    });
  });
});

/**
 * And no SPELLING VARIANTS either — second pass, same day.
 *
 * `buildRawWordGroups` gives each word up to twenty-four transliterations, so
 * a person typing „ბუღალტერი" also finds „bughalteri". Nobody typed a way-in
 * name: it is a title lifted verbatim off a web card, and each variant is
 * another full pass over the owner's book. Measured on account 501 against a
 * 470 ms network floor: one variant 592-869 ms, six variants 973-2,243 ms.
 */
describe('it looks for the name as written, not for spellings of it', () => {
  const patterns = (): string[] =>
    mockQuery.mock.calls
      .flatMap((call) => (call[1] as unknown[]) ?? [])
      .filter((p): p is string => typeof p === 'string');

  it('sends one pattern per word, not a transliteration of each', async () => {
    found([{ phone: '+995555123456', name: 'ნინო' }]);

    await searchByTagExactOnly('501', 'arqiteqtori');

    const sent = patterns().join(' ');
    // The Georgian readings buildRawWordGroups would add for this word.
    expect(sent).not.toContain('არქიტექტორ');
    expect(sent).not.toContain('არყითეყთორ');
    expect(sent).toContain('arqiteqtor');
  });

  it('still treats a two-word name as two words', async () => {
    found([]);

    await searchByTagExactOnly('501', 'Axel Group');

    const sent = patterns().join(' ');
    expect(sent).toContain('axel');
    expect(sent).toContain('group');
  });

  /**
   * The count is the point: one pattern per word, where the full builder would
   * have sent six for this one. A future change that quietly restores the
   * variants fails here rather than in a production p50.
   */
  it('sends exactly as many patterns as there are words', async () => {
    found([]);

    await searchByTagExactOnly('501', 'arqiteqtori');

    // Two calls (page and COUNT) each carrying the same single pattern.
    const distinct = new Set(patterns().filter((p) => p.includes('arqiteqtor')));
    expect(distinct.size).toBe(1);
  });
});

/**
 * ROW 108, IN A SECOND PLACE, AND I SHIPPED IT AN HOUR AGO.
 *
 * The first version of the as-written lookup split on whitespace and nothing
 * else. A web-card title is not a typed query — it carries brackets, trailing
 * stops, pipes and quotes — so:
 *
 *   „axel group."   ->  \mgroup\.        matches nobody, costs a full pass
 *   „(architect)"   ->  \m\(architect\)  cannot match at all, because \m
 *                                           needs a word character after it
 *
 * Row 108's own comment describes exactly this: „it never matched anything,
 * and still cost a full regex pass over 885,942 rows." Found by reading the
 * change back rather than by a test, which is the second time today.
 */
describe('the sentence’s punctuation never reaches the pattern', () => {
  const patterns = (): string =>
    mockQuery.mock.calls
      .flatMap((call) => (call[1] as unknown[]) ?? [])
      .filter((p): p is string => typeof p === 'string')
      .join(' ');

  it('drops a trailing stop, which would otherwise match nobody', async () => {
    found([]);

    await searchByTagExactOnly('501', 'Axel Group.');

    expect(patterns()).toContain('group');
    expect(patterns()).not.toContain('group\\.');
  });

  it('drops the brackets a web card puts round a word', async () => {
    found([]);

    await searchByTagExactOnly('501', '(Architect)');

    expect(patterns()).toContain('architect');
    expect(patterns()).not.toContain('\\(');
  });

  /**
   * ONLY THE ENDS. A host name's dot is part of the word, not the sentence's
   * punctuation, and „bookkeeping.ge" is exactly the kind of name a way-in
   * lookup is given.
   */
  it('leaves a host name whole', async () => {
    found([]);

    await searchByTagExactOnly('501', 'Bookkeeping.ge');

    // Whole, with the dot escaped so it matches a literal dot — which is what
    // a host name needs and what a trailing stop must never become.
    expect(patterns()).toContain('bookkeeping\\.ge');
  });
});
