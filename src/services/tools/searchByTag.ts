import { query } from '../../db/postgres/client';
import { buildSearchTerms, buildRawWordGroups, splitIntoWords } from './transliterate';
import { normalizeSearchToken } from './normalizeSearchToken';
import { buildExactMatchSql } from './wordMatch';
import { getExcludedPhones } from '../block.service';
import { normalizePhone } from '../phone';
import { isDisplayableTag } from './getContactFullProfile';
import { collapseMergedPhones } from './mergedIdentities';
import { applyFacts, ContactFactFields, fetchFactsForPhones } from './factEnrichment';
import {
  AccountDetails,
  fetchAccountStates,
  isMemberPhone,
  isSubscriberPhone,
  accountStateFor,
} from './membership';
import {
  fetchRelationshipForPhones,
  RelationshipInfo,
  fetchHumanTierForPhones,
  HumanTier,
} from './relationshipScores';
import { fetchExclusionsForPhones, ContactExclusion } from './contactExclusions';
import { phoneDigits } from '../phone';
import { OWNERSHIP } from './searchResultMeta';
import { searchDidNotFinish } from './searchDidNotFinish';

const FUZZY_THRESHOLD = 0.45;
const RESULT_LIMIT = 20;

/**
 * pg_trgm's own threshold, which the index-backed `%` operator uses.
 *
 * Postgres' default and the value measured on this database (show_limit(), 15
 * September). The fuzzy pass pairs `%` with an explicit similarity check, and
 * that pairing only preserves the result set while FUZZY_THRESHOLD is the
 * STRICTER of the two — otherwise `%` would quietly drop rows the explicit rule
 * accepts, and a search would lose people with nothing to show for it.
 */
const PG_TRGM_DEFAULT_LIMIT = 0.3;
if (FUZZY_THRESHOLD < PG_TRGM_DEFAULT_LIMIT) {
  throw new Error(
    `searchByTag: FUZZY_THRESHOLD ${FUZZY_THRESHOLD} is looser than pg_trgm's ` +
      `${PG_TRGM_DEFAULT_LIMIT}, so the index pre-filter would silently drop matches.`,
  );
}

// The fuzzy pass leans on the functional trigram index idx_user_tags_norm_trgm.
// Until that index is built (out of band, see migration 036) the pass would
// seq-scan; a short timeout makes it fail fast and be skipped, leaving the exact
// search untouched, instead of dragging every tag query.
const FUZZY_TIMEOUT_MS = 5_000;

interface TagRow {
  phone: string;
  name: string | null;
  saved_as: string | null;
  all_tags: string[];
  employer: string | null;
  jobPosition: string | null;
  city: string | null;
}

// The user's OWN contacts — the phones they actually have (from any tag or alias
// they saved). Recall then matches AGGREGATED tags (from every contributor) on
// these phones, so a contact surfaces by a crowd tag on their profile even if
// the user never personally typed it — the fix for "search only saw my own tags".
// MATERIALIZED pins the plan: mine (a few thousand phones) is computed once and
// every matched-branch joins FROM it via the phone indexes — the planner can't
// flip to scanning the multi-million-row alias/tag tables first, which is what
// pushed the name search past the statement timeout at prod scale.
const MY_CONTACTS_CTE = `mine AS MATERIALIZED (
     SELECT phone FROM "UserTags"  WHERE "contactId" = $1
     UNION
     SELECT phone FROM "UserAlias" WHERE "contactId" = $1
   )`;

// Aggregate the display fields for a set of matched phones. The REGISTERED
// name outranks the phonebook label — junk labels ("LIST. … Ally. Force")
// were handed to the model as the person's name and it reasoned from them
// (protocol task 42); the raw label always rides in saved_as. Empty strings
// count as missing (task 43). UserTags is LEFT-joined so a tagless
// (alias-only) contact isn't dropped.
/**
 * ⚠️ A REGISTERED NAME THAT IS AN EMAIL ADDRESS — the tester, 25 September.
 *
 * `search_contacts` with tag „lawyer" on 501 returned a person whose name read
 *
 *     „[email hidden] L"
 *
 * — a bracket where a person should be. `saved_as` carried their real name and
 * the app chat showed it correctly the same morning.
 *
 * NOT A TAG AND NOT THE SCRUBBER. Both the tester and I guessed wrong before
 * looking: the tester thought the connector assembles the name from tags, I
 * thought another contributor had saved an email as one. The truth is in
 * `"User".name` — account 551, employer Arci, job Lawyer, whose REGISTERED
 * NAME is their email address followed by „ L". One member in the whole base
 * has an „@" in their name. The scrubber then hides the address, correctly,
 * and what is left is the bracket.
 *
 * The rule above is right and stays: a registered name outranks a phonebook
 * label, because junk labels were being read as people. AN EMAIL IS NOT A NAME
 * EITHER, so it does not get to outrank anything — it falls through to the
 * label, which is the real name here and is what the app already shows.
 *
 * FIXED IN THE READER, NOT IN THE ROW. Editing a real person's name is a write
 * to their record and somebody else's to authorise; this needs nobody, works
 * for the next one, and leaves `saved_as` exactly as it was.
 */
export const DISPLAY_NAME = `COALESCE(
          CASE WHEN TRIM(MAX(u.name)) LIKE '%@%' THEN NULL
               ELSE NULLIF(TRIM(MAX(u.name)), '') END,
          MAX(ua.alias))`;

const AGG_SELECT = `h.phone,
        ${DISPLAY_NAME} AS name,
        MAX(ua.alias)                        AS saved_as,
        array_agg(DISTINCT ut.tag)           AS all_tags,
        MAX(NULLIF(TRIM(u.employer), ''))    AS employer,
        MAX(NULLIF(TRIM(u."jobPosition"), '')) AS "jobPosition",
        MAX(NULLIF(TRIM(u.city), ''))        AS city`;
const AGG_JOINS = `FROM hits h
   LEFT JOIN "UserTags"  ut ON ut.phone = h.phone
   LEFT JOIN "UserAlias" ua ON ua.phone = h.phone AND ua."contactId" = $1
   LEFT JOIN "UserPhone" up ON up.phone = h.phone
   LEFT JOIN "User"      u  ON u.id     = up."userId"`;

/**
 * Match the user's own contacts by any label (tag / alias / registered name),
 * ranked by word_hits — the count of distinct query words matched — so a
 * multi-word query surfaces the intersection first (Bug 2) and an alias-only
 * contact still surfaces (Bug 1.3b). Every branch is driven FROM the
 * materialized mine set (see buildExactMatchSql) so the plan stays index-backed
 * at prod scale.
 */
async function runExactSearch(
  userId: string,
  rawGroups: string[][],
  blockedPhones: string[],
): Promise<{ rows: TagRow[]; total: number }> {
  const m = buildExactMatchSql(userId, rawGroups, blockedPhones);
  const [result, countResult] = await Promise.all([
    query<TagRow>(
      `WITH ${MY_CONTACTS_CTE}, ${m.matchedCte},
       hits AS (
         SELECT phone, (${m.wordHits}) AS word_hits, MAX(priority) AS src_priority
         FROM matched
         WHERE phone != ALL($${m.blockIdx})
         GROUP BY phone
       )
       SELECT ${AGG_SELECT}
       ${AGG_JOINS}
       GROUP BY h.phone
       ORDER BY MAX(h.word_hits) DESC, MAX(h.src_priority) DESC,
                MAX(ut."weightCount") DESC NULLS LAST
       LIMIT ${RESULT_LIMIT}`,
      m.params,
    ),
    query<{ total: string }>(`WITH ${MY_CONTACTS_CTE}, ${m.matchedCte} ${m.totalSql}`, m.params),
  ]);
  return { rows: result.rows, total: Number(countResult.rows[0]?.total ?? result.rows.length) };
}

/**
 * Ticket 20 row 108 — why the fuzzy pass has never run.
 *
 * It timed out six times out of six on 17 September, at 5 443-5 464 ms against
 * its 5 000 ms budget, logging „pass did not run … (exact results stand)" each
 * time. So it costs every tag search five seconds and returns nothing. The
 * seat put it on row 108 and was right to: it is the same cause one floor
 * down, and on 16 September their own table showed the fuzzy pass is the whole
 * answer for some words — so it is recall lost today, not only time.
 *
 * The cause, measured on 501 against the live base — the cost is in the term
 * count, and steeply:
 *
 *    3 terms     405 ms
 *    6 terms   2 179 ms
 *    8 terms   2 924 ms
 *   12 terms   4 462 ms   <- and the real queries carry twelve or more
 *
 * Each term is matched TWICE (the `%` narrowing and the `similarity` rule), and
 * every word of the query contributes three or four transliteration variants.
 * „ქორწილის ფოტოგრაფის მომსახურება" is twelve terms before anybody has typed
 * anything unusual.
 *
 * ROUND ROBIN, NOT THE FIRST N, and that is this morning's lesson rather than a
 * preference. I capped the second-circle query at „the first eight words" and
 * it kept „გამარჯობა, მაქვს, მაგრამ" — a flat cut here would keep every
 * spelling of the first word and drop the last word entirely, which in Georgian
 * is usually the one naming the trade. So the list is walked a variant at a
 * time across all the words: every word keeps its own spelling before any word
 * gets its second.
 *
 * Six, and the margin is honest rather than comfortable: 6 terms measures
 * 2.2 s on the read-only endpoint, and production has been running slower than
 * that endpoint all day. If it still times out the log will say so, and the
 * next lever is that the exact and fuzzy passes run one after the other when
 * nothing makes them.
 *
 * AND MOST OF WHAT IT WAS PAYING FOR WAS THE SAME PATTERN TWICE — found
 * 21 September while measuring what row 222's Latin-to-Georgian direction
 * costs. The query terms are compared as `normalize_search_token(term)`, and
 * that function transliterates Georgian to Latin before folding gh/kh/ts/x/q,
 * so variants that differ on paper collapse to one string in the database.
 * Read back from the live function that day:
 *
 *   santexniki · santekhniki · santexniqi · სანთეხნიქი · სანტეხნიქი · სანთეხნიკი
 *     → six terms, all `santekniki`, one pattern
 *   accountant → six terms, all `accountant`
 *
 * So the pass was charging 6 terms (2.2 s) for what 1 term (≈0.4 s) reaches,
 * on a majority of real queries. Deduplicating by the normalized form CANNOT
 * change a result — it is the value the comparison is made on — so this is
 * cost removed and nothing else. It also frees cap slots for terms that do
 * differ, which is recall on a long query.
 */
const MAX_FUZZY_TERMS = 6;

export function cappedFuzzyTerms(perWord: readonly (readonly string[])[]): string[] {
  const flat = perWord.flat();
  const kept: string[] = [];
  const alreadyCovered = new Set<string>();
  const depth = Math.max(...perWord.map((w) => w.length), 0);
  for (let i = 0; i < depth && kept.length < MAX_FUZZY_TERMS; i++) {
    for (const word of perWord) {
      if (kept.length >= MAX_FUZZY_TERMS) break;
      const term = word[i];
      if (term === undefined) continue;
      const normalized = normalizeSearchToken(term);
      if (alreadyCovered.has(normalized)) continue;
      alreadyCovered.add(normalized);
      kept.push(term);
    }
  }
  if (kept.length < flat.length) {
    // The distinct count is taken over EVERY variant, not over the ones the
    // walk reached before the cap — otherwise the line would report the cap
    // back to itself and never show a query whose variants really outnumber it.
    const distinct = new Set(flat.map(normalizeSearchToken)).size;
    // eslint-disable-next-line no-console
    console.log(
      `[tag-fuzzy] ${flat.length} variants over ${perWord.length} word(s), ` +
        `${distinct} distinct once normalized; ` +
        `searching ${kept.length}: ${kept.join(' ')}`,
    );
  }
  return kept;
}

/**
 * Spelling-tolerant pass over the NORMALIZED tag (normalize_search_token folds
 * gh/kh/zh/ts/q/x drift), so ღ-drift spellings and typos — buralteri / bugalteri
 * / buhalteri — reach each other via trigram similarity. Best-effort: if pg_trgm
 * or the functional index is missing it returns nothing rather than failing the
 * whole search.
 */
async function runFuzzySearch(
  userId: string,
  terms: readonly string[],
  blockedPhones: string[],
): Promise<TagRow[]> {
  try {
    // Each term is matched TWICE, and the pair is the whole point.
    //
    // `similarity(a, b) > $t` cannot use a trigram index: it is a function
    // comparison, so the planner has to compute it per row. Measured on the
    // live database, 15 September:
    //
    //   similarity(...) > 0.4   Parallel Index Only Scan, 2,963,065 rows,
    //                           cost 718,596
    //   ... % ...               Bitmap Index Scan on idx_user_tags_norm_trgm,
    //                           cost 7,115
    //
    // The `%` operator IS index-backed, but it carries its own threshold —
    // pg_trgm.similarity_threshold, a session setting, measured at 0.3 here
    // (show_limit()). So `%` alone would change what the search matches, and
    // the explicit 0.45 alone cannot reach the index.
    //
    // Both: `%` narrows to the index's candidates, `similarity` keeps the
    // exact rule. Because 0.45 is STRICTER than 0.3, `%` is a superset and the
    // result set is unchanged. That inequality is the assumption this rests on,
    // so it is asserted at load rather than left in a comment to rot.
    const conds = terms
      .map(
        (_, i) =>
          `(normalize_search_token(t.tag) % normalize_search_token($${i + 2}) AND ` +
          `similarity(normalize_search_token(t.tag), normalize_search_token($${i + 2})) > $${terms.length + 2})`,
      )
      .join(' OR ');
    const blockParamIdx = terms.length + 3;
    const result = await query<TagRow>(
      `WITH ${MY_CONTACTS_CTE},
       hits AS (
         SELECT DISTINCT t.phone
         FROM "UserTags" t
         WHERE t.phone IN (SELECT phone FROM mine)
           AND (${conds})
           AND t.phone != ALL($${blockParamIdx})
       )
       SELECT ${AGG_SELECT}
       ${AGG_JOINS}
       GROUP BY h.phone
       ORDER BY MAX(similarity(normalize_search_token(ut.tag), normalize_search_token($2))) DESC
       LIMIT ${RESULT_LIMIT}`,
      [userId, ...terms, FUZZY_THRESHOLD, blockedPhones],
      FUZZY_TIMEOUT_MS,
    );
    return result.rows;
  } catch (error) {
    // The exact search still stands, so this stays best-effort — but it is no
    // longer SILENT. Before today this pass could time out at five seconds on
    // every single search, return nothing, and cost the user those five seconds
    // for nothing, with no line anywhere to say so. That is the same shape as
    // logSearchActivity failing silently on every search for hours in August.
    // eslint-disable-next-line no-console
    console.error(
      `[tag-fuzzy] pass did not run for "${terms.join(' ')}" (exact results stand):`,
      (error as Error).message,
    );
    return [];
  }
}

function shape(
  row: TagRow,
  facts: Map<string, ContactFactFields>,
  accountStates: Map<string, AccountDetails>,
  relationships: Map<string, RelationshipInfo>,
  exclusions: Map<string, ContactExclusion[]>,
  humanTiers: Map<string, HumanTier>,
  approximate: boolean,
): Record<string, unknown> {
  const base = applyFacts(
    {
      phone: row.phone,
      name: row.name ?? null,
      /**
       * ⚠️ THE SAME FILTER THE PROFILE USES, BECAUSE THIS LIST HAD NONE.
       *
       * 25 September: the profile drops an email-shaped tag through
       * `isDisplayableTag`; this one handed every stored tag straight to the
       * model, so the same „[email hidden]" the tester found on the profile
       * was also in every search result carrying that person. Two readers of
       * one table, one of them filtered — the same shape as the display name
       * being fixed in three places an hour earlier.
       */
      tags: (row.all_tags || []).filter((t: string) => Boolean(t) && isDisplayableTag(t)),
      employer: row.employer ?? null,
      jobPosition: row.jobPosition ?? null,
      city: row.city ?? null,
    },
    facts,
  );
  const rel = relationships.get(row.phone);
  const excl = exclusions.get(phoneDigits(row.phone));
  const humanTier = humanTiers.get(row.phone);
  const withMeta = {
    ...base,
    is_member: isMemberPhone(accountStates, row.phone),
    account_state: accountStateFor(accountStates, row.phone),
    netai_subscriber: isSubscriberPhone(accountStates, row.phone),
    ownership: OWNERSHIP.DIRECT,
    saved_as: row.saved_as ?? null,
    // Enrichment-computed edge category (family/close/professional/formal) —
    // lets the agent phrase how well the user knows this person. The numeric
    // strength stays server-side: a raw score printed to a user is a leak
    // (ticket 3 §6.0 — "relationship_strength 0.65" reached a reply).
    ...(rel && { relationship: rel.relationship }),
    // A tier the USER set by hand (today: old-Ally's colour classification) —
    // never computed, never overwritten by `relationship` above (ticket 6
    // task 4's conflict rule).
    ...(humanTier && { human_relationship_tier: humanTier }),
    // The user's own recorded "not this person, for this" decisions — the
    // assistant must respect the scope (and only the scope) without a lookup.
    ...(excl && excl.length > 0 && { exclusions: excl }),
  };
  return approximate ? { ...withMeta, approximate: true } : withMeta;
}

/**
 * The way-in lookup's own search: the EXACT pass, and nothing else.
 *
 * 22 SEPTEMBER, AND THE NUMBER IS THE WHOLE ARGUMENT. `findWaysIn` calls the
 * full `searchByTag` and gives it a 3,000 ms budget. On account 501 today:
 *
 *   way-in lookups that TIMED OUT   76   p50 3,000 ms   (min 2,999, max 3,006)
 *   way-in lookups that FINISHED     2      2,355 ms and 2,762 ms
 *   real tag queries, same account, same hour   p50 3,705 ms
 *
 * I put a three-second budget on an operation whose median is 3.7 seconds. It
 * cannot succeed on a real phonebook, and 97% of the time it did not: the
 * model was handed „we could not look" instead of an answer, three seconds
 * later, on every question. THE FEATURE WAS PURE COST ON EXACTLY THE ACCOUNTS
 * IT WAS BUILT FOR.
 *
 * The seat read those 76 as „returned nothing". They did not return nothing;
 * they did not finish — which `findWaysIn` records honestly (`timed_out`) and
 * renders as `unchecked`, and which is the one distinction this codebase keeps
 * having to rebuild.
 *
 * WHY THE EXACT PASS IS ENOUGH HERE, and this is not a shortcut. The fuzzy
 * pass exists so a person typing „ბუღალტერი" also finds „ბუხალტერი" — spelling
 * tolerance for a HUMAN's query. A way-in name is not typed by anybody: it is
 * a title or a host name lifted verbatim off a web card, and the question
 * asked of it is „does anyone in my contacts carry THIS, as written". A
 * near-spelling of a web page's title is not evidence of a way in.
 *
 * And none of the enrichment is read: the caller takes `results[0].name` and
 * throws the rest away. Facts, account states, relationship scores, exclusion
 * scopes and human tiers were five more queries per lookup, for a string.
 */
/**
 * A web-card name, split into words and no further — 22 September, second pass.
 *
 * `buildRawWordGroups` gives each word up to twenty-four SPELLING VARIANTS:
 * every transliteration of it, both scripts, all the ღ/გ and ქ/ყ readings. That
 * exists so a person typing „ბუღალტერი" also finds „bughalteri", and it is
 * right for a person.
 *
 * NOBODY TYPED THIS. A way-in name is a title or a host lifted verbatim off a
 * web card, and the question asked of it is „does anybody carry THIS, as
 * written". A Georgian transliteration of „Bookkeeping.ge" is not a spelling
 * anyone uses — for „eleqtrikosi" the expansion produces ელეყთრიქოს and four
 * more of the same kind — so the extra passes buy nothing here.
 *
 * AND EACH VARIANT IS ANOTHER FULL PASS OVER THE OWNER'S BOOK. Measured on 501
 * today, against a 470 ms network floor, warm:
 *
 *   one variant, tags + aliases     592 · 869 ms
 *   six variants, same shape        973 · 1,205 · 2,243 ms
 *
 * Roughly three to four times the work, for spellings of a web page's title.
 *
 * I AM NOT PROMISING A SPEED FIGURE FOR THIS. The numbers above are noisy —
 * identical queries ran 592 and 1,846 — and I have now been wrong twice about
 * where this row's three seconds go. The change stands on what the lookup
 * MEANS; the seat's next run on a real book is what will measure it.
 */
function wordsAsWritten(tagQuery: string): string[][] {
  // `splitIntoWords`, not a split of my own: the first version of this took
  // whitespace and nothing else, so „axel group." searched for `\mgroup\.` —
  // a pattern that matches nobody and still costs a full pass over the book —
  // and „(architect)" produced `\m\(architect\)`, which cannot match at all
  // because \m needs a word character after it. That is row 108 in a second
  // place, and a web-card title carries more brackets and stops than anything
  // a person types. „bookkeeping.ge" survives whole: only the ends are trimmed.
  return splitIntoWords(tagQuery).map((word) => [word.toLowerCase()]);
}

export async function searchByTagExactOnly(userId: string, tagQuery: string): Promise<object> {
  const rawGroups = wordsAsWritten(tagQuery);
  if (rawGroups.length === 0) return { found: false, query: tagQuery };

  const blockedPhones = await getExcludedPhones(userId, tagQuery);
  const excludedSet = new Set(blockedPhones.map(normalizePhone));
  const exact = await runExactSearch(userId, rawGroups, blockedPhones);
  const rows = exact.rows.filter((r) => !excludedSet.has(normalizePhone(r.phone)));
  if (rows.length === 0) return { found: false, query: tagQuery };

  return {
    found: true,
    query: tagQuery,
    count: rows.length,
    // The shape the caller reads, and no more. A way-in verdict is a name.
    results: rows.map((r) => ({ name: r.name ?? r.saved_as ?? '' })),
  };
}

export async function searchByTag(userId: string, tagQuery: string): Promise<object> {
  try {
    const blockedPhones = await getExcludedPhones(userId, tagQuery);
    const excludedSet = new Set(blockedPhones.map(normalizePhone));
    const isExcluded = (phone: string): boolean => excludedSet.has(normalizePhone(phone));

    const rawGroups = buildRawWordGroups(tagQuery);
    if (rawGroups.length === 0) return { found: false, query: tagQuery };

    const exact = await runExactSearch(userId, rawGroups, blockedPhones);
    const exactRows = exact.rows.filter((r) => !isExcluded(r.phone));

    // Fuzzy pass runs over the flat union of every word's variants (spelling
    // tolerance, no intersection ranking — it is only a fallback/union).
    const fuzzyTerms = cappedFuzzyTerms(
      tagQuery
        .trim()
        .split(/\s+/)
        .filter(Boolean)
        .map((word) => buildSearchTerms(word)),
    );
    // Always union the fuzzy pass so a query for one ღ-spelling also surfaces the
    // others (they otherwise return disjoint sets). Fuzzy-only hits are marked
    // approximate; exact hits keep priority and are never re-flagged.
    const seen = new Set(exactRows.map((r) => normalizePhone(r.phone)));
    const fuzzyRows = (await runFuzzySearch(userId, fuzzyTerms, blockedPhones)).filter(
      (r) => !isExcluded(r.phone) && !seen.has(normalizePhone(r.phone)),
    );

    if (exactRows.length === 0 && fuzzyRows.length === 0) return { found: false, query: tagQuery };

    const allPhones = [...exactRows, ...fuzzyRows].map((r) => r.phone);
    const [facts, accountStates, relationships, exclusions, humanTiers] = await Promise.all([
      fetchFactsForPhones(userId, allPhones),
      fetchAccountStates(allPhones),
      fetchRelationshipForPhones(userId, allPhones),
      fetchExclusionsForPhones(userId, allPhones),
      fetchHumanTierForPhones(userId, allPhones),
    ]);
    const results = [
      ...exactRows.map((r) =>
        shape(r, facts, accountStates, relationships, exclusions, humanTiers, false),
      ),
      ...fuzzyRows.map((r) =>
        shape(r, facts, accountStates, relationships, exclusions, humanTiers, true),
      ),
    ];
    // Ticket 16 Task 23: a pair the founder marked „one person" is one row.
    const merged = await collapseMergedPhones(results);
    const payload: Record<string, unknown> = {
      found: true,
      count: merged.rows.length,
      total: exact.total + fuzzyRows.length - merged.collapsed,
      results: merged.rows,
    };
    // Whole result is approximate only when nothing matched exactly.
    if (exactRows.length === 0) payload.fuzzy = true;
    return payload;
  } catch (err) {
    console.error('searchByTag error:', (err as Error).message);
    // A search that could not run is not an empty network — see searchDidNotFinish.
    return searchDidNotFinish('The tag search', err);
  }
}
