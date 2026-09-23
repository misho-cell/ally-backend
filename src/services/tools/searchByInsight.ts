import { query } from '../../db/postgres/client';
import { getExcludedPhoneSet } from '../block.service';
import { normalizePhone } from '../phone';
import { georgianStem } from './georgianStem';
import { buildSearchTerms } from './transliterate';
import { isUnsafeContent, isUnsafeQuery } from './contentGuard';
import {
  fetchAccountStates,
  isMemberPhone,
  isSubscriberPhone,
  accountStateFor,
} from './membership';
import { vetoedPhonesFor } from '../factCorrections.service';
import { fetchSignalStrength } from './searchSecondDegree';
import { searchDidNotFinish } from './searchDidNotFinish';

const RESULT_LIMIT = 20;
const SEARCH_TIMEOUT_MS = 12_000;
const MIN_WORD_LEN = 2;
const MAX_QUERY_WORDS = 6;
// T15's fallback (ticket 7 task 10): how many single-source pointers the
// empty case may surface.
const POINTER_LIMIT = 10;
// Same sensitivity denylist philosophy as signal_strength — a pointer must
// never be a covert read of somebody's private note about health/money/etc.
// A second, non-model guard on top of the moderator's own verdict: these keys
// never point at anyone, whatever a verdict said. 'note' left the list on
// 1 Sep — the founder's third state is exactly about notes ("X's close
// friend"), and each note now carries a per-value matchable/private judgment
// rather than being excluded as a category.
const POINTER_EXCLUDED_FIELD_TYPES = [
  'health',
  'medical',
  'illness',
  'diagnosis',
  'money',
  'income',
  'salary',
  'finance',
  'debt',
  'wealth',
  'politics',
  'political',
  'party',
  'religion',
  'religious',
  'faith',
  'relationship',
  'love',
  'dating',
  'marital_status',
  'affair',
  'criminal',
  'legal_issue',
  'arrest',
];

interface InsightHit {
  name: string | null;
  matched: string[];
  /** Stored values that matched the words but SAY THE OPPOSITE (task 14.1). */
  negated: string[];
  info: Record<string, unknown> | null;
  contact_id: string;
  /** Words hit counted in SQL, where the hidden text is still readable — positive values only. */
  sql_hits: number;
}

interface FactRow {
  phone: string;
  name: string | null;
  matched: string[] | null;
  negated?: string[] | null;
  sql_hits?: number;
}

/**
 * A stored value that carries its own negation (ticket 9 task 14 / 14.1, the
 * 5 Sep finding): `search_by_insight("invests in startups")` returned FIRST a
 * man whose stored role reads „No longer interested in investing in
 * startups… left Axel". A word search cannot see „no longer", so the sentence
 * that says he stopped matched as if it said he does.
 *
 * Such a value is still read — it is what the record says — but it never
 * counts as a positive hit. It travels beside the result as `negated`, so the
 * assistant sees the caveat instead of the claim. A constant regex over the
 * value, both scripts, whole words; nothing from the query is interpolated.
 */
const NEGATED_VALUE_SQL =
  `(' ' || LOWER(COALESCE(cf.canonical_value, cf.value)) || ' ') ~ ` +
  `'( not | never | no longer | former | ex-| stopped | left | quit | retired | აღარ | არ | ყოფილი | დატოვა | წამოვიდა | შეწყვიტა )'`;

// Every fact query anchors on a single column per bound parameter.
// contact_facts.submitted_by_user_id is TEXT on prod while "UserAlias"."contactId"
// is INTEGER, so the SAME $1 can never be compared to both in one statement
// (Postgres cannot deduce one type for the parameter and the whole query throws
// on every call). The own- and public-fact paths are therefore split into two
// queries, each also runs in isolation so a slow public scan can't hide the
// user's own freshly-saved fact — the save→search loop.
const FACT_MATCH_AGG =
  `array_agg(DISTINCT cf.field_type || ': ' || COALESCE(cf.canonical_value, cf.value)) ` +
  `FILTER (WHERE NOT ${NEGATED_VALUE_SQL})`;
const FACT_NEGATED_AGG =
  `array_agg(DISTINCT cf.field_type || ': ' || COALESCE(cf.canonical_value, cf.value)) ` +
  `FILTER (WHERE ${NEGATED_VALUE_SQL})`;

// The same aggregate for the searcher's OWN facts, with one difference: a fact
// the author marked as not-public keeps its power to FIND the person and loses
// its text.
//
// The third state's promise is "used in matching, text never shown". Until now
// the own-facts query had no visibility filter at all, so an author searching a
// word from their own hidden note got the note back in full — and the assistant
// then quoted it into the reply, once even naming who recorded it and when.
// Cross-account the wall held (proved live 2 Sep: account B searching the same
// word got a bare pointer, no text), but "never shown" should mean never, and
// a reply is the one place this text can travel.
const OWN_FACT_VALUE_SQL = `cf.field_type || ': ' ||
  CASE WHEN cf.is_public THEN COALESCE(cf.canonical_value, cf.value)
       ELSE '[your own hidden note — matched, not shown]' END`;
const OWN_FACT_MATCH_AGG = `array_agg(DISTINCT ${OWN_FACT_VALUE_SQL}) FILTER (WHERE NOT ${NEGATED_VALUE_SQL})`;
const OWN_FACT_NEGATED_AGG = `array_agg(DISTINCT ${OWN_FACT_VALUE_SQL}) FILTER (WHERE ${NEGATED_VALUE_SQL})`;

// Function words carry no concept: "works WITH German companies ON export
// deals" matched 31 people through "with"/"works" alone — crypto advisers
// ranked above an honest zero (protocol task 39, task 27's acceptance test).
const STOPWORDS = new Set([
  'the',
  'a',
  'an',
  'and',
  'or',
  'with',
  'for',
  'who',
  'that',
  'this',
  'on',
  'in',
  'of',
  'to',
  'is',
  'are',
  'was',
  'has',
  'have',
  'does',
  'do',
  'my',
  'me',
  'any',
  'some',
  'someone',
  'from',
  'at',
  'work',
  'works',
  'working',
  'ვინ',
  'ვინც',
  'რომ',
  'და',
  'ან',
  'არის',
  'აქვს',
  'მაქვს',
  'მყავს',
  'ჩემი',
  'ჩემს',
  'ვისაც',
  'მინდა',
  'ერთად',
]);

/**
 * A multi-word query matches per word (OR), not as one contiguous phrase, so
 * "იურისტი უძრავი ქონება" reaches a contact whose facts say only "უძრავი ქონება".
 * Words shorter than MIN_WORD_LEN and function words are dropped as noise; a
 * query left with nothing falls back to its raw words, then to the whole string.
 */
function queryWords(searchQuery: string): string[] {
  const raw = searchQuery
    .toLowerCase()
    .split(/\s+/)
    .map((w) => w.trim())
    .filter((w) => w.length >= MIN_WORD_LEN);
  // Each word is reduced to its Georgian stem, so a query in one case finds a
  // fact recorded in another ("ინვესტორი" → the stored "ინვესტორს"). One stem
  // per word: the count the relevance floor works from is unchanged, and a
  // stem is a prefix, so nothing that matched before stops matching.
  const meaningful = raw.filter((w) => !STOPWORDS.has(w)).slice(0, MAX_QUERY_WORDS);
  if (meaningful.length > 0) return meaningful.map(georgianStem);
  if (raw.length > 0) return raw.slice(0, MAX_QUERY_WORDS).map(georgianStem);
  const whole = searchQuery.trim().toLowerCase();
  return whole ? [whole] : [];
}

/**
 * A query that asks for the OPPOSITE of a concept (ticket 9 task 14.1).
 *
 * „people who are explicitly not investors and never invest their own money"
 * returned five people, all five investors — twice, a day apart. The engine
 * matches words and cannot see negation, so a query meaning the exact opposite
 * returns the same list, stated as an answer. That is worse than finding
 * nothing: it is a confident wrong answer built from the user's own words.
 *
 * Netai searches for what somebody IS. When the query says what somebody is
 * NOT, the honest reply is to say so — and, if there is a correction to make,
 * to make it — rather than hand back the very people the question excludes.
 */
const NEGATION_MARKERS = [
  ' not ',
  " isn't ",
  ' never ',
  ' no longer ',
  ' without ',
  ' except ',
  ' არ ',
  ' აღარ ',
  ' არავინ ',
  ' გარდა ',
];

/**
 * A NEGATION ABOUT THE ASKER IS NOT A NEGATION OF THE TARGET.
 *
 * The seat's 353, 20 September, on the founder's own network. Same person
 * wanted, one clause added:
 *
 *   „I need a lawyer who understands trademarks"                    found 1
 *   „I need a lawyer who understands trademarks,
 *    I do not know where to start"                                  REFUSED
 *   „I need a lawyer, my usual one is not free this week"           REFUSED
 *   „I need a lawyer, I don't have one yet"                         found 0
 *
 * Neither refused sentence excludes anybody. „I do not know where to start"
 * describes the ASKER; „my usual one is not free" describes a third person who
 * is not the target. And `don't` passes while `not` does not, which shows the
 * trigger was the bare token rather than the meaning.
 *
 * Refusing is worse than missing: this does not return zero rows, it tells the
 * model not to answer with a list at all. „I do not know anyone in that field"
 * is the sentence somebody types when they need the search most.
 *
 * WHAT THIS DOES NOT DO. It does not try to parse negation. It exempts a short
 * closed list of ASKER-PREDICAMENT phrases — statements about the person
 * asking, which can never be a description of who they want. Everything the
 * guard was built for still trips it, including first-person searches:
 * „I am not looking for investors" and „I do not want recruiters" are about
 * the TARGET and are deliberately absent from the list below.
 *
 * AND IT HAS NEVER FIRED ON A REAL QUERY. 766 insight searches in fourteen
 * days; three carry a negation marker and all three are the seat's, tonight.
 * The reason is worth knowing: the queries reaching this tool are the
 * distiller's short phrases („trademark lawyer"), not people's sentences. So
 * this is a guard against a path that does not exist yet — and row 145's voice
 * input, which hands a whole spoken sentence straight through, is exactly that
 * path arriving.
 */
const ABOUT_THE_ASKER = [
  /\bi do ?n['’]?o?t know\b/,
  /\bi don['’]t know\b/,
  /\bi have not\b/,
  /\bi do not have\b/,
  /\bi ?a?m not sure\b/,
  /\bmy \w+( \w+)? is not\b/,
  // NO `\b` ON THE GEORGIAN ONES. It is ASCII-only, so between „ვიცი" and the
  // space after it there is no word boundary at all and the pattern matches
  // nothing. Three files in this repository carry that warning and I wrote
  // `\b` here anyway; the test below is what caught it.
  /არ ვიცი/,
  /არ მყავს/,
  /არ მაქვს/,
];

export function isNegatedQuery(searchQuery: string): boolean {
  const flat = searchQuery.toLowerCase().replace(/\s+/g, ' ').trim();
  // The asker's own predicament is stripped before the markers are looked for,
  // so a negation left anywhere else still trips the guard.
  const aboutTheTarget = ABOUT_THE_ASKER.reduce((text, phrase) => text.replace(phrase, ' '), flat);
  const padded = ` ${aboutTheTarget.replace(/\s+/g, ' ').trim()} `;
  return NEGATION_MARKERS.some((marker) => padded.includes(marker));
}

const NEGATED_QUERY_NOTE =
  'This query asks who somebody is NOT, and this search can only find who somebody IS — a ' +
  'word search would return exactly the people the question excludes (live: „people who are ' +
  'explicitly not investors" returned five investors). Do NOT answer it with a list. Tell the ' +
  'user plainly that Netai searches for what a person IS, and ask them to say what they are ' +
  'looking FOR. If they are correcting a record — „he is no longer an investor" — call ' +
  'correct_contact_fact for that person instead, which retracts the wrong fact AND stops them ' +
  'being returned for it again.';

// What the assistant is told about a value that matched the words and says
// the opposite: it is a caveat on the person, never the reason they are listed.
const NEGATED_VALUE_NOTE =
  'These stored values contain the query words but SAY THE OPPOSITE (no longer / not / former). ' +
  'They did not count towards the match. If you mention this person, carry the caveat.';

/** The people left out because the record says the opposite of what was asked. */
function negatedNote(
  skipped: number,
): { negated_skipped: number; negated_skipped_note: string } | Record<string, never> {
  if (skipped === 0) return {};
  return {
    negated_skipped: skipped,
    negated_skipped_note:
      `${skipped} matching record(s) were left out because the stored fact says the OPPOSITE of the ` +
      'query (no longer / not / former), or because your own note about the person says so. ' +
      'Do not list them for this query.',
  };
}

/** `expr LIKE $n OR expr LIKE $n+1 ...` for `count` terms starting at `startIdx`. */
function likeOrClause(expr: string, count: number, startIdx: number): string {
  return Array.from({ length: count }, (_, i) => `${expr} LIKE $${startIdx + i}`).join(' OR ');
}

/**
 * Per-contact count of DISTINCT query words matched, computed in SQL so the
 * ranking happens BEFORE the LIMIT cuts the page. Without it the LIMIT took an
 * arbitrary 20 of all matching contacts and the best match (every word hit,
 * e.g. "Chairman @ GITA" for "GITA chairman") could be dropped before the
 * post-hoc ranking ever saw it.
 */
function wordHitsClause(expr: string, groupSizes: readonly number[], startIdx: number): string {
  // A value that says the opposite is not a hit (task 14.1).
  //
  // ONE `bool_or` PER QUERY WORD, not per pattern. A word now arrives as a
  // GROUP of spellings (see queryGroups), and „ფოტოგრაფი" matching a fact
  // written `fotografi` is the same word matched once, not two words matched.
  // Counting patterns would let a single word with many spellings outrank a
  // contact who genuinely matched two. Same shape searchSecondDegree uses.
  let cursor = startIdx;
  return groupSizes
    .map((size) => {
      const any = Array.from({ length: size }, (_, i) => `${expr} LIKE $${cursor + i}`).join(
        ' OR ',
      );
      cursor += size;
      return `bool_or(NOT ${NEGATED_VALUE_SQL} AND (${any}))::int`;
    })
    .join(' + ');
}

/**
 * Facts THIS user saved. Restricted by submitted_by_user_id first (indexed),
 * so the LIKE runs over just this user's handful of facts — fast, and the path
 * that must always succeed for the save→search memory loop.
 */
async function searchOwnFacts(
  userId: string,
  likes: string[],
  groupSizes: readonly number[],
): Promise<FactRow[]> {
  const matchExpr = 'LOWER(COALESCE(cf.canonical_value, cf.value))';
  const orClause = likeOrClause(matchExpr, likes.length, 3);
  const result = await query<FactRow>(
    // Third fallback for the name: a fact can be saved about someone the owner
    // has no phonebook entry for (found through a second-degree search, say),
    // and both earlier sources are then null — the tester saw a result render
    // as an empty line. Any alias the network has for the number is the same
    // information second-degree search already returns for a non-contact.
    `SELECT cf.neo4j_contact_id AS phone,
            COALESCE(
              MAX(ua.alias),
              MAX(u.name),
              (SELECT MIN(ua_any.alias) FROM "UserAlias" ua_any
                WHERE ua_any.phone = cf.neo4j_contact_id)
            ) AS name,
            ${OWN_FACT_MATCH_AGG} AS matched,
            ${OWN_FACT_NEGATED_AGG} AS negated,
            (${wordHitsClause(matchExpr, groupSizes, 3)}) AS sql_hits
     FROM contact_facts cf
     LEFT JOIN "UserAlias" ua ON ua.phone = cf.neo4j_contact_id AND ua."contactId" = $2
     LEFT JOIN "UserPhone" up ON up.phone = cf.neo4j_contact_id
     LEFT JOIN "User"      u  ON u.id     = up."userId"
     WHERE cf.submitted_by_user_id = $1
       AND cf.retracted_at IS NULL
       AND (${orClause})
     GROUP BY cf.neo4j_contact_id
     ORDER BY (${wordHitsClause(matchExpr, groupSizes, 3)}) DESC, MAX(cf.created_at) DESC
     LIMIT $${likes.length + 3}`,
    [userId, userId, ...likes, RESULT_LIMIT],
    SEARCH_TIMEOUT_MS,
  );
  return result.rows;
}

/**
 * Crowd-corroborated public facts, but only on contacts this user actually has.
 * Joining "UserAlias" on "contactId" first narrows the scan to this user's own
 * contacts before the LIKE, and keeps $1 bound to a single column type.
 */
async function searchPublicFacts(
  userId: string,
  likes: string[],
  groupSizes: readonly number[],
): Promise<FactRow[]> {
  const matchExpr = 'LOWER(COALESCE(cf.canonical_value, cf.value))';
  const orClause = likeOrClause(matchExpr, likes.length, 2);
  const result = await query<FactRow>(
    `SELECT cf.neo4j_contact_id AS phone,
            MAX(ua.alias) AS name,
            ${FACT_MATCH_AGG} AS matched,
            ${FACT_NEGATED_AGG} AS negated,
            (${wordHitsClause(matchExpr, groupSizes, 2)}) AS sql_hits
     FROM contact_facts cf
     JOIN "UserAlias" ua ON ua.phone = cf.neo4j_contact_id AND ua."contactId" = $1
     WHERE cf.is_public = true
       AND cf.retracted_at IS NULL
       AND (${orClause})
     GROUP BY cf.neo4j_contact_id
     ORDER BY (${wordHitsClause(matchExpr, groupSizes, 2)}) DESC, MAX(cf.created_at) DESC
     LIMIT $${likes.length + 2}`,
    [userId, ...likes, RESULT_LIMIT],
    SEARCH_TIMEOUT_MS,
  );
  return result.rows;
}

/**
 * The searcher's OWN insight notes about their OWN contacts.
 *
 * `WHERE user_id = $1` is the whole point of this function and it was missing
 * (ticket 9 task 15). Every other reader of contact_insights scopes on the
 * owner — insights.service reads `WHERE user_id = $1 AND neo4j_contact_id =
 * $2`, and privacy erasure treats the table as the user's own data — but this
 * one searched the table product-wide and returned the matching row's whole
 * `data` blob as `info`.
 *
 * Proved live on 4 September, cross-account, before the fix: test account
 * 170749 searched „ძალიან კარგი სანტექნიკი" and received the founder's private
 * characterisations of three real people — „relationship: ბიძაშვილი",
 * „თორნიკე პარტნიორია Grid Construction-ში", „პარტნიორი და ახლო მეგობარი",
 * „თორნიკეს პირადი რეკომენდაცია". That is exactly the question the tester
 * asked first: does this path print text written by a DIFFERENT person? It
 * did — not through contact_facts, whose three states hold, but through this
 * table, which had no owner check and no visibility concept at all.
 */
async function searchInsights(
  userId: string,
  likes: string[],
): Promise<
  { neo4j_contact_id: string; neo4j_contact_name: string | null; data: Record<string, unknown> }[]
> {
  const perWord = Array.from(
    { length: likes.length },
    (_, i) => `(LOWER(neo4j_contact_name) LIKE $${i + 2} OR LOWER(data::text) LIKE $${i + 2})`,
  ).join(' OR ');
  const result = await query<{
    neo4j_contact_id: string;
    neo4j_contact_name: string | null;
    data: Record<string, unknown>;
  }>(
    `SELECT neo4j_contact_id, neo4j_contact_name, data
     FROM contact_insights
     WHERE user_id = $1
       AND (${perWord})
     ORDER BY updated_at DESC
     LIMIT $${likes.length + 2}`,
    [userId, ...likes, RESULT_LIMIT],
    SEARCH_TIMEOUT_MS,
  );
  return result.rows;
}

// What the model is told about a pointer. The text it points at is never in
// the payload at all, so this is guidance, not the guarantee — the guarantee
// is that there is nothing to quote.
const POINTER_NOTE =
  'Weak, UNCONFIRMED single-source signals. Say exactly this and nothing more: these NAMED people ' +
  'may be worth asking about the query, the signal is uncertain. Use the names in this list ' +
  'verbatim and ONLY these names — the signal belongs to them, and attributing it to anyone else ' +
  'is a false statement about that person. Never say what matched, who recorded it, or that it is ' +
  'confirmed. Do not ask permission to name them; name them and let the user decide what to do.';

interface SingleSourcePointer {
  contact_id: string;
  name: string | null;
  signal_strength: number;
}

function escapeRegex(word: string): string {
  return word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Engine T15's fallback (ticket 7 task 10): when nothing over the relevance
 * floor matched, single-source person-POINTERS fire instead of a bare
 * found:false — the searcher's own contacts where somebody's unconfirmed,
 * private, non-sensitive fact matches the query. What crosses: the contact
 * (named from the searcher's OWN phonebook) and a strength score computed by
 * the same signal_strength formula second-degree search uses. The fact text
 * and its author never leave this function.
 *
 * Ticket 9 task 32.2: the content guard the T15 spec asked for and the v1 did
 * not have. The field-type denylist below cannot see an accusation typed into
 * a `note`, and these facts are exactly the ones moderation kept private — so
 * both the query and the matched text are judged before anyone is named.
 */
async function searchSingleSourcePointers(
  userId: string,
  words: string[],
  likes: string[],
  excluded: Set<string>,
): Promise<SingleSourcePointer[]> {
  // A query that is itself the accusation gets no pointers: naming people in
  // answer to "who is a thief" IS the accusation, whatever stays unquoted.
  if (isUnsafeQuery(words)) return [];

  const matchExpr = 'LOWER(COALESCE(cf.canonical_value, cf.value))';
  const orClause = likeOrClause(matchExpr, likes.length, 4);
  const candidates = await query<{ phone: string; name: string | null; matched_text: string }>(
    // matched_text is read only to be judged by the content guard below and is
    // never returned — same contract as the rest of this function.
    `SELECT cf.neo4j_contact_id AS phone, MAX(ua.alias) AS name,
            string_agg(COALESCE(cf.canonical_value, cf.value), ' ') AS matched_text
     FROM contact_facts cf
     JOIN "UserAlias" ua ON ua.phone = cf.neo4j_contact_id AND ua."contactId" = $1
     WHERE cf.is_matchable = true
       AND cf.is_public = false
       AND cf.retracted_at IS NULL
       AND cf.submitted_by_user_id <> $2
       AND cf.field_type != ALL($3::text[])
       AND (${orClause})
     GROUP BY cf.neo4j_contact_id
     LIMIT $${likes.length + 4}`,
    [userId, userId, POINTER_EXCLUDED_FIELD_TYPES, ...likes, POINTER_LIMIT],
    SEARCH_TIMEOUT_MS,
  );
  const rows = candidates.rows.filter(
    (r) => !excluded.has(normalizePhone(r.phone)) && !isUnsafeContent(r.matched_text ?? ''),
  );
  if (rows.length === 0) return [];
  const strengths = await fetchSignalStrength(
    rows.map((r) => r.phone),
    words.map(escapeRegex),
  );
  return rows
    .map((r) => ({
      contact_id: r.phone,
      name: r.name,
      signal_strength: strengths.get(r.phone) ?? 0,
    }))
    .sort((a, b) => b.signal_strength - a.signal_strength);
}

function settled<T>(result: PromiseSettledResult<T[]>, label: string): T[] {
  if (result.status === 'fulfilled') return result.value;
  console.error(`searchByInsight ${label} query failed:`, (result.reason as Error).message);
  return [];
}

/**
 * How many distinct query words appear anywhere in a hit — the ranking key.
 *
 * Counted from the printable text AND from the count SQL made before the text
 * was redacted, whichever is higher. A hidden fact of the searcher's own keeps
 * its power to find the person exactly because of this: redacting the text
 * alone dropped the row under the relevance floor and the person vanished from
 * their own search (caught live, one deploy after the redaction went out).
 */
function wordsHit(hit: InsightHit, words: string[]): number {
  const haystack = [hit.name ?? '', ...hit.matched, hit.info ? JSON.stringify(hit.info) : '']
    .join(' ')
    .toLowerCase();
  return Math.max(words.filter((w) => haystack.includes(w)).length, hit.sql_hits);
}

/**
 * Concept/fact search across everything saved about a contact:
 *   1. contact_facts — the user's own saved facts (the save→search loop) plus
 *      crowd-confirmed public facts on their contacts. This is where "who is a
 *      lawyer", "employer MKD Law" actually live.
 *   2. contact_insights — AI enrichment data.
 * Multi-word queries match per word (OR); results are then ranked by how many
 * of those words they hit, so a contact matching every word outranks one that
 * matched a single common word. All three sources run in isolation and are
 * merged by phone so one person appears once; a failure in any one source never
 * takes the others down.
 */
export async function searchByInsight(userId: string, searchQuery: string): Promise<object> {
  try {
    // A negated query is answered honestly, never with its own opposite.
    if (isNegatedQuery(searchQuery)) {
      return { found: false, query: searchQuery, note: NEGATED_QUERY_NOTE, negated: true };
    }
    const words = queryWords(searchQuery);
    if (words.length === 0) return { found: false, query: searchQuery };
    /**
     * EACH WORD IS ASKED IN BOTH SCRIPTS, which this path never did.
     *
     * The seat's 362 measured it on the founder's own network — same tool,
     * same account, same minute, one word each:
     *
     *   lawyer / იურისტი         3 English   6 Georgian   0 in both
     *   architect / არქიტექტორი  3           4            0
     *   photographer / ფოტოგრაფი 0           1            0
     *   doctor / ექიმი           2           0            0
     *   designer / დიზაინერი     0           2            0
     *
     * Eight people reachable in English, thirteen in Georgian, and NOT ONE
     * person in both, in all five pairs. The two halves of a man's own network
     * did not intersect: which language he happened to type in decided which
     * half of his contacts he could reach.
     *
     * The cause was one line. `search_by_tag` has run every word through
     * `buildSearchTerms` for weeks — Georgian to Latin, plus the gh/kh/ts
     * drift and the case endings. This path had only `georgianStem`, which
     * stems Georgian and never leaves it.
     *
     * WHAT THIS FIXES AND WHAT IT DOES NOT, because the difference is the
     * whole of my own 314 and I will not blur it here:
     *
     *   FIXED     „ფოტოგრაფი" now reaches a fact written `fotografi` or
     *             `potograpi`. Same word, other alphabet.
     *   NOT FIXED „photography" still does not reach „ფოტოგრაფი". That is
     *             TRANSLATION, not transliteration, and no character map
     *             performs it.
     *
     * The second half stays the model's job — it knows the Georgian for
     * photographer — and the tool's description now says so instead of asking
     * for „a short natural-language description" with no word about script.
     *
     * THE OTHER DIRECTION IS NOT BUILT, AND HERE IS THE SIZE OF WHAT THAT
     * COSTS, because „I did not build it" deserves a number rather than a
     * shrug. The seat's 374 measured it: `iuristi` reaches nothing while
     * „იურისტი" reaches six; `arqiteqtori` nothing while „არქიტექტორი"
     * reaches four. A Latin-spelled query does not reach a Georgian-script
     * fact.
     *
     * Every core fact in the base, 20 September:
     *
     *   occupation  161 rows    46 Georgian script   115 Latin only
     *   industry    110          5                   105
     *   employer    105          1                   104
     *   city         75          6                    69
     *   TOTAL       451         58 (13%)             393 (87%)
     *
     * So the direction ABOVE, which is built, reaches 87% of what is stored.
     * The direction below reaches the remaining 58 rows, 46 of them
     * occupations.
     *
     * WHY IT IS NOT BUILT. `GEO_TO_LATIN` is MANY-TO-ONE — „თ" and „ტ" both
     * give „t", „ქ" and „კ" both give „k", „ც" and „წ" both „ts", „ჩ" and
     * „ჭ" both „ch". Reversing it is combinatorial: every ambiguous letter
     * doubles the candidate spellings, and each candidate is another LIKE
     * pattern in a query whose cost I measured today and which is already the
     * slowest thing this product does.
     *
     * Fifty-eight rows against a combinatorial expansion of the hot path is
     * not a trade I would make tonight, and the seat did not ask me to —
     * „we are not asking you to fix it tonight… it is one half of one row".
     *
     * AND THE EXISTING INSTRUCTION ALREADY COVERS IT when it is followed: the
     * tool's own description says to run both languages. The 13% is reachable
     * the moment the model asks in Georgian too. If that turns out not to
     * happen in practice, the honest next step is to measure how often it is
     * followed — not to build the reverse map first.
     */
    const groups = words.map((word) => {
      const variants = new Set<string>([word, ...buildSearchTerms(word)]);
      return [...variants].filter((v) => v.length >= MIN_WORD_LEN);
    });
    const groupSizes = groups.map((g) => g.length);
    const likes = groups.flat().map((w) => `%${w}%`);

    const [ownSettled, publicSettled, insightSettled, excluded] = await Promise.all([
      Promise.allSettled([searchOwnFacts(userId, likes, groupSizes)]).then((r) => r[0]),
      Promise.allSettled([searchPublicFacts(userId, likes, groupSizes)]).then((r) => r[0]),
      Promise.allSettled([searchInsights(userId, likes)]).then((r) => r[0]),
      // Blocked/deceased, plus everyone this user has said is NOT this
      // (ticket 9 task 14): a correction the founder made in July must stop
      // the July claim being offered back to him in September.
      Promise.all([getExcludedPhoneSet(userId, searchQuery), vetoedPhonesFor(userId, words)]).then(
        ([blocked, vetoed]) => new Set([...blocked, ...vetoed]),
      ),
    ]);

    const ownRows = settled(ownSettled, 'own facts');
    const publicRows = settled(publicSettled, 'public facts');
    const insightRows = settled(insightSettled, 'insights');

    // The searcher's OWN record saying the opposite outranks the crowd's claim
    // (task 14: "a correction outranks the fact it corrects"). The founder's
    // note „not an investor, never invests his own money" is a correction
    // whether or not he ever called correct_contact_fact — so a person his own
    // facts negate for these words is dropped from THIS search entirely, the
    // way a recorded veto drops them.
    const ownNegated = new Set(
      ownRows
        .filter((row) => (row.negated ?? []).length > 0)
        .map((row) => normalizePhone(row.phone)),
    );
    // Counted per person, not per source row: one man negated by the searcher's
    // own note and claimed by the crowd is one person left out.
    const negatedSkipped = new Set<string>();

    // Merge by normalized phone; facts win on name, insights fill the info blob.
    const byPhone = new Map<string, InsightHit>();
    for (const row of [...ownRows, ...publicRows]) {
      const key = normalizePhone(row.phone);
      if (excluded.has(key)) continue;
      if (ownNegated.has(key)) {
        negatedSkipped.add(key);
        continue;
      }
      const matched = (row.matched ?? []).filter(Boolean);
      const negated = (row.negated ?? []).filter(Boolean);
      const sqlHits = Number(row.sql_hits ?? 0);
      // Only the opposite was said about this person: not a hit at all (14.1).
      if (matched.length === 0 && negated.length > 0 && sqlHits === 0) {
        negatedSkipped.add(key);
        continue;
      }
      const existing = byPhone.get(key);
      if (existing) {
        existing.name = existing.name ?? row.name ?? null;
        existing.matched = [...new Set([...existing.matched, ...matched])];
        existing.negated = [...new Set([...existing.negated, ...negated])];
        existing.sql_hits = Math.max(existing.sql_hits, sqlHits);
      } else {
        byPhone.set(key, {
          name: row.name ?? null,
          matched,
          negated,
          info: null,
          contact_id: row.phone,
          sql_hits: sqlHits,
        });
      }
    }
    for (const row of insightRows) {
      const key = normalizePhone(row.neo4j_contact_id);
      if (excluded.has(key) || ownNegated.has(key)) continue;
      const existing = byPhone.get(key);
      if (existing) {
        existing.info = row.data;
        existing.name = existing.name ?? row.neo4j_contact_name ?? null;
      } else {
        byPhone.set(key, {
          name: row.neo4j_contact_name ?? null,
          matched: [],
          negated: [],
          sql_hits: 0,
          info: row.data,
          contact_id: row.neo4j_contact_id,
        });
      }
    }

    // Relevance floor (protocol task 39): every row carries its score — the
    // fraction of concept words it actually hit — and a row hitting fewer than
    // half of them is noise, not a lead. Nothing over the floor = an honest
    // found:false, which beats 31 crypto advisers for a German-export query.
    const minHits = Math.max(1, Math.ceil(words.length / 2));
    const scored = [...byPhone.values()]
      .map((hit) => ({ hit, hits: wordsHit(hit, words) }))
      .filter((s) => s.hits >= minHits)
      .sort((a, b) => b.hits - a.hits);
    if (scored.length === 0) {
      // T15's fallback: the honest found:false, now WITH single-source
      // pointers when unconfirmed private signals exist (ticket 7 task 10).
      const pointers = await searchSingleSourcePointers(userId, words, likes, excluded).catch(
        (err: unknown) => {
          // eslint-disable-next-line no-console
          console.error('searchByInsight pointer fallback failed:', (err as Error).message);
          return [] as SingleSourcePointer[];
        },
      );
      return {
        found: false,
        query: searchQuery,
        note: 'nothing matched enough of the query',
        ...(pointers.length > 0 && { pointers, pointer_note: POINTER_NOTE }),
        ...negatedNote(negatedSkipped.size),
      };
    }

    const accountStates = await fetchAccountStates(scored.map((s) => s.hit.contact_id));
    const results = scored.map((s) => ({
      // sql_hits is ranking machinery, not an answer — spreading the hit whole
      // put it in front of the assistant. An empty `negated` is noise too.
      ...(({ sql_hits: _ignored, negated, ...rest }) => ({
        ...rest,
        ...(negated.length > 0 && { negated, negated_note: NEGATED_VALUE_NOTE }),
      }))(s.hit),
      score: Math.round((s.hits / words.length) * 100) / 100,
      is_member: isMemberPhone(accountStates, s.hit.contact_id),
      account_state: accountStateFor(accountStates, s.hit.contact_id),
      netai_subscriber: isSubscriberPhone(accountStates, s.hit.contact_id),
    }));

    // Matchable facts add people HERE too, not only when the search came back
    // empty (the founder's 1 Sep ruling: the note works "in backmind and in
    // matching"). Anyone already in results is dropped — a pointer is the
    // weaker claim, and the same person must never appear twice.
    const found = new Set(results.map((r) => normalizePhone(r.contact_id)));
    const pointers = (
      await searchSingleSourcePointers(userId, words, likes, excluded).catch((err: unknown) => {
        // eslint-disable-next-line no-console
        console.error('searchByInsight pointer pass failed:', (err as Error).message);
        return [] as SingleSourcePointer[];
      })
    ).filter((p) => !found.has(normalizePhone(p.contact_id)));

    return {
      found: true,
      count: results.length,
      results,
      ...(pointers.length > 0 && { pointers, pointer_note: POINTER_NOTE }),
      ...negatedNote(negatedSkipped.size),
    };
  } catch (err) {
    console.error('searchByInsight error:', (err as Error).message);
    // A search that could not run is not an empty network — see searchDidNotFinish.
    return searchDidNotFinish('The insight search', err);
  }
}
