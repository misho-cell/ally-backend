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
   * THE SECOND CIRCLE IS THE BRIDGES' KNOWLEDGE. `tag_hits` takes tags whose
   * `contactId` is a bridge; this takes facts whose SUBMITTER is one. Anything
   * wider would reach outside the circle this tool is allowed to see.
   */
  it('only reads facts a bridge wrote', () => {
    const at = sql.indexOf('fact_hits AS (');
    const cte = sql.slice(at, at + 1600);

    expect(cte).toContain(
      'JOIN friend_users fu_f ON fu_f."userId"::text = cf.submitted_by_user_id',
    );
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
   * AND THE FIRST VERSION OF THIS CTE DID CAST THE DATA, which is the fault
   * this file's own P0 comment is about. It survived one review and was caught
   * by asking what happens to the first non-numeric submitter id anybody
   * writes — „all 1,282 live rows are numeric" is a fact about today.
   */
  it('never casts the data, only the server-made column', () => {
    const at = sql.indexOf('fact_hits AS (');
    const cte = sql.slice(at, at + 1600);

    expect(cte).not.toContain('cf.submitted_by_user_id::int');
    expect(cte).toContain('fu_f."userId"::text');
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
