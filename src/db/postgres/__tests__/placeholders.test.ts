import { assertPlaceholdersMatchParams } from '../placeholders';

/**
 * The reaper's four silent hours, as a test.
 *
 * 20 September, `54af32f`: two Georgian captions came out of the run reaper's
 * statement, taking their `$1` and `$2` with them and leaving the interval
 * reading `$3` over a one-element array. Postgres numbers parameters by the
 * highest one referenced, so it wanted three, got one, and said „could not
 * determine data type of parameter $1" — the wrong number, no query named,
 * inside a `catch` that logs and carries on. `sweepOrphanedRuns` threw every
 * twenty seconds from 10:13 to 14:20 and nothing looked different from
 * outside, because a reaper that finds nothing and a reaper that cannot run
 * are the same thing seen from the product.
 *
 * Every test here mocks the database, which is why the SQL text was the one
 * part of that statement nobody was checking. This checks it without one.
 */
describe('a statement may not ask for a parameter it was not given', () => {
  it('accepts a query whose highest placeholder is covered', () => {
    expect(() => assertPlaceholdersMatchParams('SELECT 1 WHERE a = $1', ['x'])).not.toThrow();
    expect(() =>
      assertPlaceholdersMatchParams('SELECT 1 WHERE a = $2 AND b = $1', ['x', 'y']),
    ).not.toThrow();
    expect(() => assertPlaceholdersMatchParams('SELECT 1', undefined)).not.toThrow();
  });

  it('refuses the exact shape that broke the reaper', () => {
    expect(() =>
      assertPlaceholdersMatchParams(
        "SELECT 1 FROM threads WHERE updated_at < NOW() - ($3 || ' seconds')::interval",
        [75],
      ),
    ).toThrow(/\$3 but only 1 parameter/);
  });

  it('names the query, because the database will not', () => {
    // „could not determine data type of parameter $1" points at the wrong one
    // and says nothing about which of a hundred statements it came from.
    expect(() => assertPlaceholdersMatchParams('SELECT $2 FROM t', [])).toThrow(
      /SELECT \$2 FROM t/,
    );
  });

  /**
   * A `$n` that is not a parameter must not stop a query that works. These are
   * all real shapes from this codebase; refusing any of them would be a worse
   * bug than the one being fixed, because it would refuse at runtime what the
   * database accepts.
   */
  it('ignores a $n inside a string, a comment or a dollar-quoted body', () => {
    expect(() =>
      assertPlaceholdersMatchParams("SELECT ('$3 seconds')::interval", []),
    ).not.toThrow();
    expect(() => assertPlaceholdersMatchParams('SELECT 1 -- once used $9\n', [])).not.toThrow();
    expect(() => assertPlaceholdersMatchParams('SELECT 1 /* was $7 */', [])).not.toThrow();
    expect(() => assertPlaceholdersMatchParams('DO $$ BEGIN PERFORM $4; END $$', [])).not.toThrow();
  });

  /** More parameters than placeholders is legal in Postgres and stays legal. */
  it('says nothing about a spare parameter, which the database allows', () => {
    expect(() => assertPlaceholdersMatchParams('SELECT $1', ['a', 'b'])).not.toThrow();
  });
});
