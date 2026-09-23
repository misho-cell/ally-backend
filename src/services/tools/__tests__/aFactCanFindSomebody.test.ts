import { readFileSync } from 'fs';
import { join } from 'path';
import { fewestSources } from '../searchSecondDegree';

/**
 * ROWS 252 AND 255, AND THEY ARE ONE BUILD BECAUSE ONE WITHOUT THE OTHER IS
 * WORSE THAN NEITHER.
 *
 * 252: `contact_facts` appeared three times in the second-circle query and not
 * once as a source of CANDIDATES — a LATERAL join to decorate a person already
 * found, a ranking score, and a ranking bonus. A fact rewarded whoever the tags
 * had found and could never find anybody. Saved as an architect by somebody who
 * knows you, and untagged, you did not exist for an architect search.
 *
 * 255: a single member's note was then told to other members as a plain fact —
 * the tester watched Test 2's assistant say „Netai Test 6 is a tax accountant"
 * three times on the strength of one note Test 1 had saved.
 *
 * WHY TOGETHER. 252 alone multiplies 255: it would surface people on the
 * strength of one person's note and the assistant would state those notes as
 * facts about them. The founder's two rulings are the two halves —
 *
 *   D440 (22 Sep): the fact makes the person FINDABLE at once.
 *   D449 (23 Sep): it is SAID only once a second, independent member agrees;
 *                  his own notes count at once; before that, the name only.
 *
 * — so findability and tellability ship in the same change or the product says
 * something about somebody that one person guessed.
 *
 * THE COST, MEASURED BEFORE WRITING ANY OF IT, because the board said this was
 * row 108 territory and worth hesitating over:
 *
 *     contact_facts, every row ever       1,545
 *     travelling and role-shaped            392
 *     UserTags on one account's bridges 605,086
 *
 * Timed three times against production: the whole table with the regex on it is
 * indistinguishable from an empty query — 436 ms against 443 ms for `SELECT 1`.
 * The caution was unfounded and the board now says so.
 */
describe('fewestSources — null is not zero, and that distinction is the point', () => {
  /**
   * A value from the self-profile carries no count at all. Null means „this is
   * not a fact", which is a different thing from „no member said it", and
   * collapsing them would make a profile field look uncorroborated.
   */
  it('is null when nothing came from a fact', () => {
    expect(fewestSources(null, null)).toBeNull();
    expect(fewestSources()).toBeNull();
  });

  /** pg returns bigint as a string, which is how the count actually arrives. */
  it('reads the counts pg really sends', () => {
    expect(fewestSources('1', null)).toBe(1);
    expect(fewestSources('3', '2')).toBe(2);
  });

  /**
   * THE WEAKER OF THE TWO WINS. A corroborated job title beside a one-source
   * employer is still a pair with something uncorroborated in it, and the
   * caller is about to decide whether to say any of it out loud.
   */
  it('takes the smallest, not the largest', () => {
    expect(fewestSources(5, 1)).toBe(1);
    expect(fewestSources(1, 5)).toBe(1);
  });

  it('ignores a count that is not a number rather than reporting NaN', () => {
    expect(fewestSources('not a number', '2')).toBe(2);
    expect(fewestSources('not a number')).toBeNull();
  });
});

/**
 * THE QUERY ITSELF, because it is the whole of row 252 and a unit test cannot
 * reach it — the database is mocked everywhere else in this suite, and the
 * entire feature is twenty lines of SQL. Both fragments were run against
 * production before this file existed: `fact_hits` returned 3 hits on 3 people
 * for an accountant/architect pattern, and the counting LATERAL returned
 * sources = '1' on real rows.
 */
describe('the second-circle query looks in the facts', () => {
  const sql = readFileSync(join(__dirname, '..', 'searchSecondDegree.ts'), 'utf8');

  it('makes facts a source of candidates, not only of ranking', () => {
    expect(sql).toContain('fact_hits AS (');
    // In the union, or it decorates and finds nobody — which was the bug.
    const matchesAt = sql.indexOf('matches AS (');
    const union = sql.slice(matchesAt, matchesAt + 400);
    expect(union).toContain('SELECT phone, "contactId", label FROM fact_hits');
  });

  /**
   * THE SECOND CIRCLE IS WHO THE BRIDGES KNOW — NOT WHO WROTE THE NOTE, WHICH
   * IS WHAT THIS ASSERTION USED TO SAY AND WHAT THE SEAT'S RUN DISPROVED.
   *
   * It required `JOIN friend_users fu_f ON fu_f."userId"::text =
   * cf.submitted_by_user_id`: a fact counted only if its AUTHOR was one of the
   * owner's contacts. On 23 September Test 2 saved „wine importer" on Test 3,
   * and Test 6 — whose bridge to Test 3 is Test 4 — searched nine ways and
   * found nobody, because the author was a stranger to them although the
   * person was not.
   *
   * Whose word says what somebody does, and who can reach them, are two
   * questions. A tag answers both at once because it belongs to the tagger; a
   * fact is a statement ABOUT somebody and they come apart. The circle is
   * enforced HERE, by the bridge's own phonebook, which is also the person an
   * introduction would have to go through.
   */
  it('reaches only people a bridge actually has in their phonebook', () => {
    const at = sql.indexOf('fact_hits AS (');
    const cte = sql.slice(at, at + 2200);

    expect(cte).toContain('JOIN "UserAlias" ua_b ON ua_b.phone = cf.neo4j_contact_id');
    expect(cte).toContain('WHERE ua_b."contactId" = ANY(b.ids)');
    // The bridge named to the owner is the one who knows them, not the author.
    expect(cte).toContain('ua_b."contactId",');
  });

  /**
   * AND THE AUTHOR IS NO LONGER A CONDITION AT ALL. Left in place beside the
   * new join it would have been an AND, and the row would have gone on failing
   * for exactly the reason it failed before.
   */
  it('no longer requires the fact’s author to be a bridge', () => {
    const at = sql.indexOf('fact_hits AS (');
    const cte = sql.slice(at, at + 2200);

    expect(cte).not.toContain('cf.submitted_by_user_id');
  });

  /**
   * A STRICTLY PRIVATE FACT MUST NOT PUT ITS SUBJECT IN A STRANGER'S RESULTS.
   * The same travel filter `fetchSignalStrength` states in those words, and the
   * one line here whose absence would be a privacy fault rather than a bug.
   */
  it('refuses a fact its author did not let travel', () => {
    const at = sql.indexOf('fact_hits AS (');
    const cte = sql.slice(at, at + 900);

    expect(cte).toContain('(cf.is_public OR cf.is_matchable)');
    expect(cte).toContain('cf.retracted_at IS NULL');
  });

  /**
   * AND IT CASTS NOTHING, WHICH IS WHERE THIS CTE'S TWO EARLIER VERSIONS BOTH
   * WENT WRONG.
   *
   * The first cast the DATA — `cf.submitted_by_user_id::int` — which throws on
   * the first non-numeric submitter id anybody ever writes; „all 1,282 live
   * rows are numeric" is a fact about today. The second cast the server-made
   * column instead, which was safe but only because the join existed at all.
   *
   * The join that replaced it needs no cast in either direction, and that was
   * checked against the live catalogue rather than assumed:
   * `"UserAlias".phone` is varchar and `contact_facts.neo4j_contact_id` is
   * text — one type family; `"UserAlias"."contactId"` and the bridge ids are
   * both integer. This file already carries an „integer = text" P0 and I have
   * written one more since, on this same row.
   */
  it('casts no join column, because every pair already matches', () => {
    const at = sql.indexOf('fact_hits AS (');
    const cte = sql.slice(at, at + 2200);

    // The only casts left are on the two field-type ARRAYS, which are
    // parameters and not columns of anybody's table.
    expect(cte.replace(/::text\[\]/g, '')).not.toMatch(/::(int|text)\b/);
  });

  /** Row 255: the count has to leave the query, or the caller cannot use it. */
  it('carries how many members stand behind each value', () => {
    expect(sql).toContain('AS employer_sources');
    expect(sql).toContain('AS "jobPositionSources"');
    expect(sql).toContain('COUNT(DISTINCT cf2.submitted_by_user_id)');
    expect(sql).toContain('role_sources: sources');
  });
});

/**
 * AND THE TOOL HAS TO SAY WHAT THE NUMBER MEANS, WHICH THE FIRST VERSION DID
 * NOT — found by running the live search and reading my own output.
 *
 * The description told the model: a row carrying `role_source: label` is a
 * label and must not be stated as fact, „without that field the value is
 * confirmed". That sentence was true the hour before this shipped and false the
 * hour after: a fact with `role_sources: 1` carries no `role_source`, so the
 * model would have read one member's note as a CONFIRMED FACT — which is row
 * 255's original bug, walked straight back in through the tool description
 * while the query underneath was busy preventing it.
 *
 * The first live search returned `"role_sources":1` on a CFO, which is exactly
 * the row that would have been announced.
 */
describe('the model is told what the count means', () => {
  const chat = readFileSync(join(__dirname, '..', '..', 'chat.service.ts'), 'utf8');
  const at = chat.indexOf('Search for contacts of contacts (2nd degree)');
  const description = chat.slice(at, at + 2600);

  it('explains role_sources rather than leaving it to be guessed', () => {
    expect(description).toContain('role_sources');
    expect(description).toContain('FEWER THAN TWO');
  });

  /** Name, not role — the founder's own words for what to do below two. */
  it('says to give the name and not the role below two sources', () => {
    expect(description).toMatch(/give the NAME and do not state the role/);
  });

  /**
   * AND THE OLD SENTENCE IS GONE, not merely added to. „Without that field the
   * value is confirmed" contradicts everything above it and the model would
   * have had to choose between two rules in one paragraph.
   */
  it('no longer says an unlabelled value is confirmed', () => {
    expect(description).not.toContain('without that field the value is confirmed');
  });
});
