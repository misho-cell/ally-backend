/**
 * `/admin/asks` — the number a reader counts on, and the sentence beside it.
 *
 * The seat read „100 asks before the block and 100 after" as evidence that the
 * introduction route creates no ask row. It reads 100 whatever happens: the
 * route returned a bare array capped at 100, with no total and no flag. They
 * caught it themselves, on the fourth reading.
 *
 * The first mend published a total, and published it from a SECOND statement
 * run beside the page. Two statements on a live table are two snapshots however
 * they are launched: an ask written between them gives a total of 100, a page
 * of 100, and `truncated: false` over a table holding 101 — the same false
 * reassurance one step along. So the count rides on the rows themselves, from
 * `COUNT(*) OVER ()`, and this is where the three are put together.
 */
jest.mock('../../../db/postgres/client', () => ({
  query: jest.fn(),
  __esModule: true,
  default: { end: jest.fn() },
}));

import { askPageFrom } from '../admin.routes';

/** A page of `n` asks out of `total`, shaped as the query returns them. */
function page(n: number, total: number): { id: number; total_count: number }[] {
  return Array.from({ length: n }, (_, i) => ({ id: i + 1, total_count: total }));
}

describe('the ask page reports what it actually holds', () => {
  it('says it was cut when the limit hid rows', () => {
    const { asks, total, truncated } = askPageFrom(page(100, 176));

    expect(asks).toHaveLength(100);
    expect(total).toBe(176);
    expect(truncated).toBe(true);
  });

  it('says it was not cut when the page is the whole table', () => {
    expect(askPageFrom(page(12, 12)).truncated).toBe(false);
  });

  /**
   * The empty page is the one a reader most wants to trust — „this task sent no
   * asks" is a conclusion drawn from it. Zero rows carry no window count, so
   * the total has to be zero rather than absent, and nothing may be truncated.
   */
  it('an empty page is empty, not unknown', () => {
    expect(askPageFrom([])).toEqual({ asks: [], total: 0, truncated: false });
  });

  /**
   * `total_count` is the window function's, not a column of `task_asks`. Left
   * on, it would be published on all 176 rows as though the table carried it,
   * and a reader would have two numbers for one thing — which is Ticket 16 Task
   * 64's fault exactly.
   */
  it('does not hand the window count out as one of the ask’s own fields', () => {
    const [ask] = askPageFrom([{ id: 1, question: 'who knows a notary?', total_count: 176 }]).asks;

    expect(ask).toEqual({ id: 1, question: 'who knows a notary?' });
    expect(Object.keys(ask)).not.toContain('total_count');
  });

  /**
   * `/admin/chorus/asks` composes with this rather than repeating it — the
   * campaign screen had the SAME bare-array-capped-at-the-limit fault, and two
   * copies of „truncated" is how they come to disagree. Enrichment happens
   * after, on `asks`, so the shape this returns has to survive being mapped.
   */
  it('returns asks the caller can enrich without losing total or truncated', () => {
    const { asks, total, truncated } = askPageFrom(page(100, 125));
    const enriched = asks.map((a) => ({ ...a, why_them: 'because' }));

    expect(enriched).toHaveLength(100);
    expect(enriched[0]).toMatchObject({ id: 1, why_them: 'because' });
    expect(enriched[0]).not.toHaveProperty('total_count');
    // A map changes no length, so the flag computed before it still holds.
    expect(enriched.length < total).toBe(truncated);
  });

  /**
   * The count comes from the same snapshot as the rows, so this cannot happen
   * from the database. It can happen from a caller that builds the rows itself,
   * and „more rows than the table holds" must not read as `truncated: false`
   * — the flag would then be right by accident and wrong in meaning.
   */
  it('does not claim a cut when it holds more than the count says exists', () => {
    expect(askPageFrom(page(5, 3)).truncated).toBe(false);
  });
});
