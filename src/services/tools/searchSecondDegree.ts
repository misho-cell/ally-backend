import { query } from '../../db/postgres/client';

const SECOND_DEGREE_QUERY_TIMEOUT_MS = 15_000;

import { getSession } from '../../db/neo4j/client';
import { getCompositeKeyForUser } from '../../services/neo4j.keys';
import { buildRawWordGroups, toWordStartPattern } from './transliterate';
import { getExcludedPhones } from '../block.service';
import { fetchExclusionsForPhones } from './contactExclusions';
import { phoneDigits } from '../phone';
import { normalizePhone } from '../phone';
import { collapseMergedPhones } from './mergedIdentities';
import { rolesFromLabels } from './labelEmployer';
import {
  applyRelationshipWarmth,
  relationshipTouchedPhones,
} from '../contactRelationships.service';
import { OWNERSHIP } from './searchResultMeta';
import {
  accountStateFor,
  fetchAccountStates,
  isMemberPhone,
  isSubscriberPhone,
} from './membership';

/**
 * Ticket 20 row 108, second pass — a ceiling on how much work one query may ask
 * for, and the first pass of it was wrong in two ways worth writing down.
 *
 * The cost of this search is (rows the bridges own) x (patterns), and only the
 * second factor is under anybody's control. Measured on account 501 against the
 * live base, the whole query, both halves and the ranking:
 *
 *    3 patterns    4.9 s
 *    9 patterns   10.2 s
 *   13 patterns   12.3 s
 *   51 patterns   times out at 15 s and returns nobody
 *
 * The first pass counted WORDS and allowed eight of them. Both halves of that
 * were wrong, and goal 4522 showed it within the hour:
 *
 *   13:34:49 [second-degree] user 501: query had 17 word groups (51 patterns);
 *            searching the first 8
 *
 * WORDS ARE THE WRONG UNIT. A Georgian word carries about three transliteration
 * variants, so eight words is roughly twenty-four patterns — well past the
 * twelve-ish that fits in the budget. Patterns are what the database runs, so
 * patterns are what gets counted.
 *
 * AND „THE FIRST N" IS THE WRONG N. The eight it kept were „გამარჯობა, მაქვს,
 * კონსერვების, საწარმო, მაგრამ, მიჭირს, მარკეტინგში, ამისთვის" — the greeting
 * and the filler. I assumed the front of a sentence carries the meaning; in a
 * Georgian sentence the need comes last. So the words that can never be
 * anybody's tag are dropped BEFORE the count, and the ceiling is applied to
 * what is left.
 *
 * None of this is the real fix, and it must not be mistaken for one: the
 * opening search sends the distiller's short phrase, and the distiller
 * understands the sentence in a way a word list never will. This is the
 * backstop for the path where that did not happen — and on 4522 it did not.
 */

/**
 * Words that are never a tag. Not a general stopword list: every entry is a
 * word that appeared in a real query on the board and cost a full pass over
 * 885,942 rows to match nobody. Kept short and specific for that reason — a
 * long list guessed in advance would eventually drop a word somebody really
 * did write in their phonebook.
 */
const NEVER_A_TAG = new Set([
  // greetings and connectives
  'გამარჯობა',
  'მაგრამ',
  'და',
  'ან',
  'რომ',
  'რომელიც',
  'ესეც',
  'ამისთვის',
  'hello',
  'hi',
  'but',
  'and',
  'or',
  'that',
  'which',
  'for',
  'with',
  'the',
  'a',
  'an',
  // having and needing — the shape of every goal sentence
  'მაქვს',
  'მყავს',
  'არის',
  'მჭირდება',
  'გვჭირდება',
  'დამჭირდა',
  'მინდა',
  'ვეძებ',
  'ვეძებთ',
  'საჭიროა',
  'მიჭირს',
  'დამეხმარება',
  'დამეხმარე',
  'i',
  'we',
  'need',
  'want',
  'looking',
  'find',
  'help',
  'me',
  'my',
]);

/**
 * The most patterns one query may run — and this number was tuned on the wrong
 * instrument twice, so the reasoning matters more than the value.
 *
 * My measurements were taken through the read-only endpoint, running the same
 * query shape over and over. Every one of them was WARM: `Buffers: shared hit
 * 68,347, read 1`. Production's first second-circle call of a run is cold, and
 * the tester's three sentences on baea336 say what that costs:
 *
 *   goal 4621   9 patterns (capped from 51)   17.5 s   <- I predicted 10.2
 *   goal 4622   a 3-word English distillation 15.2 s
 *   goal 4623   7 patterns (capped from 10)   11.8 s
 *
 * and in those same three runs, the model's OWN second-degree calls, with
 * queries of the same size, a few seconds later: 6.9, 7.4, 8.4, 8.8 s. Same
 * shape, half the time, because by then the pages are in memory.
 *
 * So the pattern count is NOT the dominant cost on the call that matters, and a
 * ceiling tuned to it cannot buy what I said it would. Worse, at 9 it started
 * taking things it should not: goal 4623's query was distilled properly to
 * „ქორწილის ფოტოგრაფი ქუთაისი", ten patterns, and the cap threw away the city.
 *
 * Fifteen. High enough that a distilled query — two to four words, which is
 * what the distiller produces — is never touched, and low enough that Ninia's
 * 51-pattern sentence still cannot reach the database. That is the whole of
 * what a backstop should do. The first call being cold is a different problem
 * and needs a different fix; capping words was never going to solve it.
 */
const MAX_QUERY_PATTERNS = 15;

/** Always search for something, even if the first word alone is over budget. */
export function cappedGroups(groups: string[][], userId: string): string[][] {
  const meaningful = groups.filter((g) => !NEVER_A_TAG.has(g[0] ?? ''));
  const candidates = meaningful.length > 0 ? meaningful : groups;
  const kept: string[][] = [];
  let patterns = 0;
  for (const group of candidates) {
    if (kept.length > 0 && patterns + group.length > MAX_QUERY_PATTERNS) break;
    kept.push(group);
    patterns += group.length;
  }
  if (kept.length === groups.length) return groups;
  // eslint-disable-next-line no-console
  console.warn(
    `[second-degree] user ${userId}: query had ${groups.length} word groups ` +
      `(${groups.flat().length} patterns); searching ${kept.length} (${patterns} patterns): ` +
      kept.map((g) => g[0]).join(' '),
  );
  return kept;
}

const MAX_FRIEND_PHONES = 3000;
// A target reachable through MORE mutuals is a stronger, more-verified bridge —
// rank by that and cap at a real limit, so the right connection isn't lost in an
// arbitrary unordered slice (was an unranked LIMIT 20).
const SECOND_DEGREE_RESULT_LIMIT = 30;
const WEAK_TIE_SIGNAL_CAP = 3;

/**
 * If the second-degree query matches contacts the user ALREADY holds directly,
 * record a weak-tie signal on those edges (they asked for a path instead of
 * calling). Consumed as a down-rank when this user appears as a via-bridge in
 * other users' results. Best-effort — never blocks or fails the search.
 */
async function recordWeakTieSignals(userId: string, likeTerms: string[]): Promise<void> {
  if (likeTerms.length === 0) return;
  const likeOr = likeTerms.map((_, i) => `LOWER(alias) LIKE $${i + 2}`).join(' OR ');
  await query(
    `INSERT INTO weak_tie_signals (user_id, contact_phone)
     SELECT DISTINCT $1::int, phone
     FROM "UserAlias"
     WHERE "contactId" = $1 AND (${likeOr})
     LIMIT ${WEAK_TIE_SIGNAL_CAP}
     ON CONFLICT (user_id, contact_phone) DO NOTHING`,
    [userId, ...likeTerms],
  );
}

// Engine T15: "match strength returned, fact text never" (ticket 6, 20 Aug
// spec; named load-bearing again in the P0 round — this is the mechanism
// aggregate crowd evidence is supposed to reach a searcher through WITHOUT
// disclosure). A second-degree target's employer/jobPosition only surface
// when a fact is public or the searcher's own (privacy-correct — see
// fe/fj above) — which starves to null for almost every real second-degree
// case today (T10, 4 consecutive rounds: 0 of 936+ facts product-wide are
// public yet). signal_strength answers a narrower, safe question instead:
// "how well does this person match the query", scored from EVERY signal on
// them — public or not, anyone's tag or fact — while the actual matched
// word never leaves this function. Two components: how many DISTINCT
// contributors tagged them with a matching word (crowd corroboration, the
// Dato Q7 pattern — 22 people independently calling one man "shpana" is
// real signal even though no single submission is public), and whether any
// fact at all (public or private) matches — a coarse "yes/no" so a single
// private submission still helps rank without ever being readable.
const SIGNAL_TAG_WEIGHT = 0.15;
const SIGNAL_TAG_CAP = 3;
const SIGNAL_FACT_WEIGHT = 0.5;
const SIGNAL_MAX = 1.0;

// The 20 Aug spec, verbatim: "Facts tagged sensitive (health, money,
// politics, religion, love life) or ugly/unlawful are excluded from
// signalling entirely." No moderation classifier for "ugly/unlawful" exists
// in this codebase — this denylist is a real but partial safeguard, not the
// full spec; flagged honestly, not silently shipped as complete. 'note' is
// excluded outright — it's this codebase's own catch-all for "personal or
// ambiguous" content (contactFacts.service.ts's moderation comment), the
// exact shape sensitive material accumulates as, so it never contributes
// even without a category match.
// 'note' left this list on 1 Sep with the pointer denylist it mirrors: a note
// now carries a per-value public/matchable/private verdict, and excluding the
// whole category here scored every note-based pointer at exactly 0 — the
// founder's live run returned four pointers, all strength 0, while a
// need-based one scored 0.5. Same list, same reasoning, or the number lies.
const SIGNAL_EXCLUDED_FIELD_TYPES = [
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

// Where a second-degree row's title and employer come from, in preference
// order (ticket 9 task 25). Both are read privacy-scoped: a PUBLIC fact, or
// one the searcher wrote themselves.
const TITLE_FACT_FIELDS = ['role', 'occupation'];
const EMPLOYER_FACT_FIELDS = ['employer', 'affiliation'];

// Exported for T15's empty-case fallback in searchByInsight (ticket 7 task
// 10) — ONE strength vocabulary product-wide, never a re-guessed copy.
export async function fetchSignalStrength(
  phones: string[],
  regexTerms: string[],
): Promise<Map<string, number>> {
  if (phones.length === 0 || regexTerms.length === 0) return new Map();
  try {
    const tagConds = regexTerms.map((_, i) => `LOWER(ut.tag) ~ $${i + 2}`).join(' OR ');
    const excludedIdx = regexTerms.length + 2;
    const valueConds = regexTerms.map((_, i) => `LOWER(cf.value) ~ $${i + 2}`).join(' OR ');
    const result = await query<{ phone: string; strength: number }>(
      `SELECT p.phone,
              LEAST(${SIGNAL_MAX},
                ${SIGNAL_TAG_WEIGHT} * LEAST(${SIGNAL_TAG_CAP}, (
                  SELECT COUNT(DISTINCT ut."contactId") FROM "UserTags" ut
                  WHERE ut.phone = p.phone AND (${tagConds})
                ))
                + ${SIGNAL_FACT_WEIGHT} * (CASE WHEN EXISTS (
                    SELECT 1 FROM contact_facts cf
                    WHERE cf.neo4j_contact_id = p.phone AND cf.retracted_at IS NULL
                      AND cf.field_type != ALL($${excludedIdx}::text[])
                      -- Only a fact whose author allowed it to travel may move
                      -- a number other people see. A strictly private fact
                      -- must not raise a stranger's strength score even by
                      -- one step: that number would be a covert read of it.
                      AND (cf.is_public OR cf.is_matchable)
                      AND (${valueConds})
                  ) THEN 1 ELSE 0 END)
              ) AS strength
       FROM unnest($1::text[]) AS p(phone)`,
      [phones, ...regexTerms, SIGNAL_EXCLUDED_FIELD_TYPES],
      SECOND_DEGREE_QUERY_TIMEOUT_MS,
    );
    return new Map(
      result.rows.filter((r) => Number(r.strength) > 0).map((r) => [r.phone, Number(r.strength)]),
    );
  } catch (err) {
    console.error('fetchSignalStrength error:', (err as Error).message);
    return new Map();
  }
}

/**
 * Row 108, third cut: where the time goes INSIDE one call.
 *
 * The seat measures this tool at the boundary — one wall-clock number per call
 * — and on 36d5f14 that number said the tail had collapsed (0 of 9 past 15 s,
 * against 10 of 45 before) while the median had barely moved: 8,154 -> 7,593 ms.
 * Their reading, and I agree with it, is that the row holds two costs and the
 * alternation only touched one. A boundary number cannot tell them apart, and
 * neither can my bench: the bench times the SQL, and the SQL is not the call.
 *
 * So the call now says how it spent itself. One line per search, no names, no
 * query text — the durations and the sizes that explain them.
 */
function phaseLine(marks: readonly (readonly [string, number])[], total: number): string {
  return marks.map(([name, ms]) => `${name} ${ms}`).join(' + ') + ` = ${total} ms`;
}

export async function searchSecondDegree(userId: string, tagQuery: string): Promise<object> {
  const began = Date.now();
  const marks: [string, number][] = [];
  let at = began;
  const mark = (name: string): void => {
    const now = Date.now();
    marks.push([name, now - at]);
    at = now;
  };
  try {
    let userKey: string;
    try {
      userKey = await getCompositeKeyForUser(Number(userId));
    } catch {
      return { found: false, reason: 'user_phone_not_found' };
    }
    mark('key');

    // Step 1: get direct contact keys from Neo4j (capped to avoid large payloads).
    // Use indexed lookup: try composite key first, then fall back to individual phones
    // for legacy nodes that haven't been migrated yet (before neo4j_backfill runs).
    const userPhones = userKey.split('-');
    // One transient blip must not hollow out the whole answer — retry once with
    // a fresh session before declaring the graph down.
    let friendKeys: string[] = [];
    let graphDown = false;
    for (let attempt = 0; attempt < 2; attempt++) {
      const session = getSession();
      try {
        const neo4jResult = await session.run(
          `MATCH (me:AllyNode {phoneKey: $userKey})-[:CONTACT]->(friend:AllyNode)
           RETURN DISTINCT friend.phoneKey AS phoneKey
           LIMIT ${MAX_FRIEND_PHONES}`,
          { userKey },
          { timeout: 8000 },
        );
        friendKeys = neo4jResult.records
          .map((r) => r.get('phoneKey') as string | null)
          .filter((p): p is string => p !== null);

        // Fallback: if composite key node has no contacts, try each individual phone key.
        // Old nodes use a single phone as the key instead of the composite format.
        if (friendKeys.length === 0 && userPhones.length > 1) {
          const fallback = await session.run(
            `UNWIND $userPhones AS phone
             MATCH (me:AllyNode {phoneKey: phone})-[:CONTACT]->(friend:AllyNode)
             RETURN DISTINCT friend.phoneKey AS phoneKey
             LIMIT ${MAX_FRIEND_PHONES}`,
            { userPhones },
            { timeout: 8000 },
          );
          friendKeys = fallback.records
            .map((r) => r.get('phoneKey') as string | null)
            .filter((p): p is string => p !== null);
        }
        graphDown = false;
        break;
      } catch (neo4jErr) {
        console.error(
          `searchSecondDegree neo4j error (attempt ${attempt + 1}/2):`,
          (neo4jErr as Error).message,
        );
        graphDown = true;
      } finally {
        await session.close();
      }
    }
    if (graphDown) {
      // Loud, honest degrade: the model must tell the user the answer is
      // partial, not silently thin it out as if the network were empty.
      return {
        found: false,
        reason: 'neo4j_unavailable',
        note:
          'The connection graph is TEMPORARILY unavailable — this is a technical outage, not an ' +
          'empty network. Tell the user plainly that second-degree paths are missing from this ' +
          'answer right now and offer to retry in a bit; do NOT conclude no path exists.',
      };
    }

    mark('graph');

    if (friendKeys.length === 0) return { found: false, reason: 'no_contacts_in_graph' };

    const blockedPhones = await getExcludedPhones(userId);
    const blockedSet = new Set(blockedPhones.map(normalizePhone));
    const isExcluded = (phone: string): boolean => blockedSet.has(normalizePhone(phone));

    // Composite keys (e.g. "+99551111-+99599999") must be expanded to individual phones
    // before matching against UserPhone which stores one row per phone.
    // Blocked phones are removed here to exclude them as intermediaries (via).
    const friendPhones = [...new Set(friendKeys.flatMap((k) => k.split('-')))].filter(
      (p) => !isExcluded(p),
    );

    mark('blocked');

    if (friendPhones.length === 0) return { found: false, reason: 'no_contacts_in_graph' };

    // Step 2: search friends' contacts in PostgreSQL — filter first, join last
    // Ticket 20 row 110. buildSearchTerms puts the WHOLE query in as one term
    // and never splits it, so search_second_degree("marketing agency") asked
    // for a tag whose word-start match is the literal phrase. Measured on the
    // base: "marketing agency" as a phrase is on 0 people, "marketing" on 2,892
    // and "agency" on 694. Every multi-word second-degree search in the
    // tester's reports was asking for something nobody writes in a phonebook,
    // and correctly finding nobody.
    //
    // buildRawWordGroups is the splitter this needed, and it already existed:
    // search_by_tag has used it since the "Dachi Axel" finding. One of the two
    // searches learned about phrases and the other never did.
    const groups = cappedGroups(buildRawWordGroups(tagQuery), userId);
    const likeTerms = groups.flat().map((t) => '%' + t + '%');

    // Weak-tie signal: asking for a PATH to a contact you already hold directly
    // means that edge is weak. Record it (fire-and-forget) so this user is
    // down-ranked as a warm bridge to that person for OTHER users.
    void recordWeakTieSignals(userId, likeTerms).catch(() => undefined);

    // Matching is WORD-START on the RAW text, for tags and aliases alike, and
    // the normalize fold is OUT of second-degree entirely — a product call as
    // much as a perf one (tester findings, 7 Aug):
    //  - the folded similarity match returned Khazaradze rows for "kasradze"
    //    (k↔kh/x collapse) — wrong results, not just slow ones;
    //  - the same fold turned 'axel' into '%akel%', whose trigrams sit inside
    //    half of Georgian surnames — every trigram-index path exploded there
    //    (gate or recheck, it only moved between deploys);
    //  - mid-word substring hits (Margita for "gita") were wrong AND heavy.
    // Cross-script coverage comes from buildRawWordGroups' per-WORD variant
    // groups now, not from buildSearchTerms' variants of the whole phrase
    // (Ticket 20 row 110) — each word still carries its own transliteration and
    // spelling forms, so nothing is lost by splitting. ღ-drift tolerance is
    // deliberately NOT offered here (the direct tag search keeps it, clearly
    // labeled approximate).
    // There used to be a `|| ''` on each LOWER(...) here, making every filter
    // non-indexable on purpose so the planner had exactly one plan: probe each
    // friend's rows via the contactId btrees and filter in memory, at a cost
    // bounded by the friend set and identical for every term. The reasoning was
    // sound and the price turned out to be very high. Measured on the live
    // database, 16 September, user 501 (282 friend accounts), term „marketing",
    // the real LATERAL shape, 416 rows returned BOTH ways:
    //
    //   (LOWER(tag) || '') ~ …   6017 ms   282 loops, ~1,987 rows discarded
    //                                      each, 43,774 heap fetches,
    //                                      5,165 ms of it waiting on disk
    //   LOWER(tag) ~ …            692 ms   Bitmap Index Scan on
    //                                      idx_user_tags_trgm, 598 ms of disk
    //
    // 8.7x, for the same answer. Three of these in one goal run is the reason
    // a search felt like it had hung.
    //
    // The wrapper did not make the plan predictable; it took the CHOICE away.
    // Removing it does not force the trigram path — it lets the planner cost
    // both and pick, per query, which is what it is for. The gita finding
    // stands and is handled where it belongs: `\m` word-start on the raw text,
    // no normalize fold, so „gita" cannot match Margita whichever plan runs.
    //
    // AND THE SAME WRAPPER IS CORRECT IN wordMatch.ts, which is not a
    // contradiction — measured both ways on the live base, same term, same day:
    //
    //   tag search (mine-scoped LATERAL)      with `|| ''`   150 ms
    //   „javakhishvili"                       without      1,690 ms
    //   second degree (friend-scoped LATERAL) with `|| ''`   734 ms
    //   „javakhishvili"                       without         96 ms
    //
    // Eleven times worse there, seven times better here, for the identical
    // edit. The difference is what the nested loop has to scan. wordMatch
    // probes `mine` — a few thousand of the user's OWN phones, a handful of
    // tags each — so the per-phone index is unbeatable and pulling 3,868 global
    // trigram rows to join against it is waste. This query probes per FRIEND
    // ACCOUNT, and a friend's row is their whole phonebook: 282 friends x ~1,987
    // tags is over half a million rows before the filter. There the same 3,868
    // rows are a bargain.
    //
    // So neither file should be „harmonised" with the other. If somebody comes
    // to make them consistent, this is the measurement that says not to.
    // $3..$(2+n) = word-start regexes, $(3+n) = blocked phones.
    //
    // The patterns are now the flattened per-word groups rather than variants
    // of one phrase. The OR below finds anyone matching ANY word; word_hits in
    // `ranked` counts how many DISTINCT words each person matched, and the
    // ordering puts the people carrying all of them first. Without that a
    // two-word search would hand back everyone matching the commoner word, in
    // an order that ignores the rarer one — which is worse than today's zero.
    const groupRegex = groups.map((g) => g.map(toWordStartPattern));
    const regexTerms = groupRegex.flat();
    const n = regexTerms.length;
    // Row 108, second measurement. The FILTER is one alternation; the per-word
    // patterns stay, but only where they are cheap.
    //
    // The scan that finds the rows runs the filter once per row over every tag
    // and alias the owner's bridges hold — 605,086 tag rows and 134,628 alias
    // rows on account 501. Nine separate `LOWER(tag) ~ $k` conditions are nine
    // regex passes over each of those rows; `LOWER(tag) ~ '\ma|\mb|…'` is one
    // pass that tests the same nine alternatives. Same rows, a fraction of the
    // work. Measured on the live base, same account, same nine patterns
    // („მცირე ბიზნესის ბუღალტერი"), whole query, EXPLAIN ANALYZE, warm, each
    // form run four times alternating:
    //
    //   separate ORs    7,817 / 7,822 / 7,853 / 7,872 ms
    //   one alternation 4,588 / 4,597 ms
    //
    // and on the scans alone: tags 4,756 → 2,535 ms, aliases 3,140 → 1,762 ms.
    // Smaller queries too, so there is no regime where this loses:
    // 2 patterns („marketing") 385 → 78 ms; 5 patterns 2,805 → 1,969 ms.
    //
    // SAME ROWS, checked as sets in both directions rather than assumed: tags
    // 451 = 451, aliases 477 = 477, zero rows unique to either side.
    //
    // This contradicts a measurement written in this file on 18 September —
    // „a single alternation was 4x faster at three patterns and timed out at
    // nine". That was measured on the LATERAL-per-bridge shape, which this
    // query no longer uses. Under the one-scan shape the alternation wins
    // everywhere. The earlier note was right about the query it tested and
    // wrong about the query we run.
    //
    // Joining with `|` is safe: toWordStartPattern escapes every regex
    // metacharacter, `|` among them, so no term can reach across the bar, and
    // alternation binds loosest so `\ma|\mb` is exactly „\ma OR \mb".
    //
    // A one-term query sends the same pattern twice — once for the filter and
    // once for word_hits. That is deliberate: a branch that drops the extra
    // parameter for n=1 would make the parameter list depend on the query, and
    // a parameter list that shifts under you is how the `integer = text` P0
    // below happened. One redundant string is the cheaper mistake.
    const filterIdx = 3 + n;
    const filterPattern = regexTerms.join('|');
    const tagConds = `LOWER(ut.tag) ~ $${filterIdx}`;
    const aliasConds = `LOWER(ua_m.alias) ~ $${filterIdx}`;
    // bool_or per GROUP, summed: one point for each query word this person
    // matched anywhere, exactly the shape wordMatch.ts uses for the tag search.
    // These stay per-word — word_hits must know WHICH word matched, and it runs
    // over the few hundred rows that survived the filter, not over the base.
    let cursor = 3;
    const wordHits = groupRegex
      .map((group) => {
        const clause = group.map((_, i) => `label ~ $${cursor + i}`).join(' OR ');
        cursor += group.length;
        return `bool_or(${clause})::int`;
      })
      .join(' + ');
    const blockParamIdx = filterIdx + 1;
    // userId again, as its own parameter: $1 is inferred as int (contactId
    // joins) while contact_facts.submitted_by_user_id is TEXT in prod — one
    // parameter cannot carry both types.
    const factsUserIdx = blockParamIdx + 1;
    // Ticket 9 task 25. The title came only from 'occupation' and the employer
    // only from 'employer', so a person whose title lives in 'role' — 96 of
    // its 97 live rows are public, and it is where Lika's researched profiles
    // put "Co-Founder & CEO @ KLIPY" — read back as null. Order matters: the
    // first field type present wins.
    const titleFieldsIdx = factsUserIdx + 1;
    const employerFieldsIdx = factsUserIdx + 2;

    // Rank FIRST, decorate LAST: the old shape joined the display tables
    // (8.4M-row UserAlias among them) onto EVERY match before the LIMIT — a
    // broad term (~45k matched contacts) turned that into full-table hash
    // joins and a statement timeout. The ranking core (mutuals − weak ties,
    // warmth) is cheap and picks the top rows; names and fields are resolved
    // for those rows only.
    const result = await query<{
      phone: string;
      target_user_id: number | null;
      name: string | null;
      via_names: string[] | null;
      via_contacts: { name: string | null; phone: string }[] | null;
      employer: string | null;
      jobPosition: string | null;
      warmth: number | null;
    }>(
      `WITH friend_users AS (
         SELECT up."userId", up.phone AS via_phone
         FROM "UserPhone" up
         WHERE up.phone = ANY($2)
       ),
       -- Row 108. ONE scan over every bridge's rows, not one scan PER bridge.
       --
       -- These two were LATERAL joins: for each of the owner's bridges — 305
       -- of them on account 501 — a separate index scan of that bridge's tags
       -- with every pattern applied. Measured on the live base, same account,
       -- same patterns, EXPLAIN ANALYZE:
       --
       --   3 patterns   LATERAL 802.7 ms   this shape 802.3 ms   identical
       --   9 patterns   LATERAL TIMED OUT  this shape 4,114 ms
       --   9 patterns, this shape, tags AND aliases together:  3,078 ms
       --
       -- The 9-pattern LATERAL was re-run three times and timed out every
       -- time, so it is the shape and not the weather. Nine patterns is an
       -- ordinary distilled query. The two forms converge when there are few
       -- patterns and diverge badly as the count grows, which is exactly the
       -- range real searches live in — and it is why the second-degree search
       -- at the opening of a goal had never once returned on a Georgian need.
       --
       -- SAME ROWS, and that was checked rather than assumed: both forms run
       -- over the same patterns give 23,711 rows, with zero rows present in
       -- one and absent from the other, compared as sets in both directions.
       --
       -- Duplicate bridges are harmless either way. A bridge with two phones
       -- appears twice in friend_users, so the LATERAL emitted its matches
       -- twice; matches below is a UNION and collapsed them, and the bridge
       -- count in ranked is COUNT(DISTINCT), so neither form can inflate it.
       --
       -- Two other candidates were measured and rejected before this one: a
       -- LIKE pre-filter (2,400x faster on a rare term, 7x SLOWER on a common
       -- one) and collapsing the patterns into a single alternation (4x faster
       -- at three patterns, timed out at nine). Both were fast in the case
       -- tried first and worse in the case that matters. This one is neutral
       -- in the small case and decisive in the large one.
       --
       -- The alternation verdict above was RETRACTED the same day: it was
       -- measured on the LATERAL shape this comment replaced, and under the
       -- one-scan shape it wins in every regime. It is now what the single
       -- filter parameter carries — see the measurement above the query.
       bridges AS (SELECT ARRAY(SELECT DISTINCT "userId" FROM friend_users) AS ids),
       tag_hits AS (
         SELECT ut.phone, ut."contactId", LOWER(ut.tag) AS label
         FROM "UserTags" ut, bridges b
         WHERE ut."contactId" = ANY(b.ids)
           AND (${tagConds})
       ),
       alias_hits AS (
         SELECT ua_m.phone, ua_m."contactId", LOWER(ua_m.alias) AS label
         FROM "UserAlias" ua_m, bridges b
         WHERE ua_m."contactId" = ANY(b.ids)
           AND (${aliasConds})
       ),
       -- The label rides along ONLY as far as word_hits below. It never leaves
       -- this CTE: the outer select aggregates phones and joins names, so the
       -- text somebody wrote in their phonebook reaches the ranking and never
       -- the reply — the same containment wordMatch.ts relies on.
       matches AS (
         SELECT phone, "contactId", label FROM tag_hits
         UNION
         SELECT phone, "contactId", label FROM alias_hits
       ),
       ranked AS (
         SELECT m.phone,
                (${wordHits})                                             AS word_hits,
                (COUNT(DISTINCT fu."userId") - COUNT(DISTINCT w.user_id)) AS bridge_rank,
                MAX(crs.strength_score)                                   AS warmth
         FROM matches m
         JOIN friend_users fu         ON fu."userId" = m."contactId"
         LEFT JOIN "UserAlias" ua_own ON ua_own.phone = m.phone AND ua_own."contactId" = $1
         LEFT JOIN weak_tie_signals w ON w.contact_phone = m.phone AND w.user_id = fu."userId"
         LEFT JOIN contact_relationship_scores crs
                ON crs.user_id = fu."userId" AND crs.contact_phone = m.phone
         WHERE ua_own.phone IS NULL
           AND m.phone != ALL($${blockParamIdx})
         GROUP BY m.phone
         ORDER BY (${wordHits}) DESC,
                  (COUNT(DISTINCT fu."userId") - COUNT(DISTINCT w.user_id)) DESC,
                  MAX(crs.strength_score) DESC NULLS LAST,
                  m.phone
         LIMIT ${SECOND_DEGREE_RESULT_LIMIT}
       )
       SELECT r.phone,
              MAX(up_t."userId")                                               AS target_user_id,
              COALESCE(MAX(u_t.name), MAX(ua_t.alias))                        AS name,
              array_agg(DISTINCT COALESCE(ua_via.alias, u_via.name))
                FILTER (WHERE COALESCE(ua_via.alias, u_via.name) IS NOT NULL) AS via_names,
              -- Ticket 14 [30]: the bridge as an askable person, not just a name.
              -- The founder's plan named the bridges, the model asked the
              -- targets' phones, and five asks bounced as „not a member".
              jsonb_agg(DISTINCT jsonb_build_object(
                'name', COALESCE(ua_via.alias, u_via.name),
                'phone', fu.via_phone))                                        AS via_contacts,
              COALESCE(MAX(NULLIF(TRIM(u_t.employer), '')),       MAX(fe.val)) AS employer,
              COALESCE(MAX(NULLIF(TRIM(u_t."jobPosition"), '')),  MAX(fj.val)) AS "jobPosition",
              -- via_warmth v2 (task 55, founder pulled it forward): the flat
              -- 0.4 was the unscored-edge baseline. Real signals now blend in,
              -- computed only for the LIMITed page: the bridge's relationship
              -- score, how much the bridge actually SAVED about the target
              -- (tags), whether they submitted facts, and — the strongest —
              -- whether an ask between them was ever ANSWERED.
              MAX(LEAST(0.95, GREATEST(
                COALESCE(r.warmth, 0.3),
                0.3
                + 0.05 * LEAST((SELECT COUNT(*) FROM "UserTags" t2
                                WHERE t2."contactId" = fu."userId" AND t2.phone = r.phone), 4)
                + CASE WHEN EXISTS (SELECT 1 FROM contact_facts cf2
                                    WHERE cf2.submitted_by_user_id = fu."userId"::text
                                      AND cf2.neo4j_contact_id = r.phone
                                      AND cf2.retracted_at IS NULL)
                       THEN 0.1 ELSE 0 END
                + CASE WHEN up_t."userId" IS NOT NULL AND EXISTS (
                        SELECT 1 FROM task_asks ta
                        WHERE ta.status = 'answered'
                          -- task_asks.from_user_id/to_user_id are INTEGER in prod (verified via
                          -- information_schema) — unlike contact_facts.submitted_by_user_id
                          -- (TEXT), which the ::text cast above was correctly modeled on. Applying
                          -- that same cast here compared an INTEGER column to a TEXT value on
                          -- every row and broke search_second_degree entirely (P0, 23 Aug — every
                          -- call failed with "operator does not exist: integer = text").
                          AND ((ta.from_user_id = fu."userId" AND ta.to_user_id = up_t."userId")
                            OR (ta.from_user_id = up_t."userId" AND ta.to_user_id = fu."userId")))
                       THEN 0.2 ELSE 0 END
              )))                                                              AS warmth
       FROM ranked r
       JOIN matches m               ON m.phone     = r.phone
       JOIN friend_users fu         ON fu."userId" = m."contactId"
       LEFT JOIN "UserAlias" ua_t   ON ua_t.phone  = r.phone AND ua_t."contactId" = m."contactId"
       LEFT JOIN "UserPhone"  up_t  ON up_t.phone  = r.phone
       LEFT JOIN "User"       u_t   ON u_t.id      = up_t."userId"
       LEFT JOIN "UserAlias" ua_via ON ua_via.phone = fu.via_phone AND ua_via."contactId" = $1
       LEFT JOIN "User"      u_via  ON u_via.id     = fu."userId"
       -- Role data (ticket 6 close §8): the User self-profile is almost always
       -- empty, so employer/jobPosition came back null for everyone — role
       -- searches were impossible. Facts are the real source, privacy-scoped:
       -- only PUBLIC (2+ confirmations) facts or the SEARCHER'S OWN. Empty
       -- strings count as missing (§10).
       LEFT JOIN LATERAL (
         SELECT NULLIF(TRIM(COALESCE(cf.canonical_value, cf.value)), '') AS val
         FROM contact_facts cf
         WHERE cf.neo4j_contact_id = r.phone
           AND cf.field_type = ANY($${employerFieldsIdx}::text[])
           AND cf.retracted_at IS NULL
           AND (cf.is_public OR cf.submitted_by_user_id = $${factsUserIdx})
         -- 'employer' first, then 'affiliation' — array_position keeps the
         -- preference in the data rather than in a second query.
         ORDER BY array_position($${employerFieldsIdx}::text[], cf.field_type),
                  cf.is_public DESC, cf.updated_at DESC
         LIMIT 1
       ) fe ON TRUE
       LEFT JOIN LATERAL (
         SELECT NULLIF(TRIM(COALESCE(cf.canonical_value, cf.value)), '') AS val
         FROM contact_facts cf
         WHERE cf.neo4j_contact_id = r.phone
           AND cf.field_type = ANY($${titleFieldsIdx}::text[])
           AND cf.retracted_at IS NULL
           AND (cf.is_public OR cf.submitted_by_user_id = $${factsUserIdx})
         -- 'role' first: it is the specific title Lika's profiles carry
         -- ("Co-Founder & CEO @ KLIPY"), and 96 of its 97 live rows are
         -- public, while this query only ever read 'occupation'.
         ORDER BY array_position($${titleFieldsIdx}::text[], cf.field_type),
                  cf.is_public DESC, cf.updated_at DESC
         LIMIT 1
       ) fj ON TRUE
       GROUP BY r.phone, r.word_hits, r.bridge_rank, r.warmth
       ORDER BY r.word_hits DESC, r.bridge_rank DESC, r.warmth DESC NULLS LAST,
                MAX(COALESCE(u_t.name, ua_t.alias))
       LIMIT ${SECOND_DEGREE_RESULT_LIMIT}`,
      [
        userId,
        friendPhones,
        ...regexTerms,
        filterPattern,
        blockedPhones,
        userId,
        TITLE_FACT_FIELDS,
        EMPLOYER_FACT_FIELDS,
      ],
      SECOND_DEGREE_QUERY_TIMEOUT_MS,
    );

    mark('sql');

    const rows = result.rows.filter((r) => !isExcluded(r.phone));
    if (rows.length === 0) {
      console.log(
        `[second-degree] ${phaseLine(marks, Date.now() - began)} | ` +
          `patterns ${n} bridges ${friendPhones.length} rows 0`,
      );
      return { found: false, reason: 'no_matches' };
    }

    // The user's own "not this person, for this" decisions ride along here
    // too — Beso Ortoidze was excluded for intros and re-offered 40 minutes
    // later precisely because only the DIRECT tools carried exclusions.
    const [exclusions, signalStrength, relationshipTouched, accountStates, labelRoles] =
      await Promise.all([
        fetchExclusionsForPhones(
          userId,
          rows.map((r) => r.phone),
        ),
        fetchSignalStrength(
          rows.map((r) => r.phone),
          regexTerms,
        ),
        // D34: an edge the SEARCHER recorded touching a result lifts its
        // warmth. Membership only — the relation text never enters a response.
        relationshipTouchedPhones(
          userId,
          rows.map((r) => r.phone),
        ),
        // Rule 13: whether each target has ever actually used Netai, not merely
        // whether an account row resolved.
        fetchAccountStates([
          ...rows.map((r) => r.phone),
          ...rows.flatMap((r) => (r.via_contacts ?? []).map((bridge) => bridge.phone)),
        ]),
        // Ticket 17 Task 8 (D202): where no fact answered, the company or trade
        // word of the row's OWN label stands in — „მერი ჩაჩანიძე TBC Capital"
        // works at TBC Capital. Only those words; the rest of the label stays
        // where it was. See labelEmployer.ts for what is dropped and why.
        rolesFromLabels(
          rows.map((r) => ({
            label: r.name,
            hasEmployer: r.employer !== null,
            hasTitle: r.jobPosition !== null,
          })),
        ),
      ]);
    mark('decorate');
    console.log(
      `[second-degree] ${phaseLine(marks, Date.now() - began)} | ` +
        `patterns ${n} bridges ${friendPhones.length} rows ${rows.length}`,
    );

    const shaped = rows.map((row) => {
      const fromLabel = (row.name !== null ? labelRoles.get(row.name) : undefined) ?? {};
      const employer = row.employer ?? fromLabel.employer ?? null;
      const jobPosition = row.jobPosition ?? fromLabel.title ?? null;
      return {
        phone: row.phone,
        name: row.name ?? null,
        employer,
        jobPosition,
        // The model must not read a label word as a confirmed fact: it is what
        // this person's savers wrote, not what anyone verified.
        ...((row.employer === null && employer !== null) ||
        (row.jobPosition === null && jobPosition !== null)
          ? { role_source: 'label' }
          : {}),
        ownership: OWNERSHIP.SECOND_DEGREE,
        // Consistent with the direct-search tools: every person-shaped result
        // carries is_member — and since Rule 13 (founder D102, 3 Sep) that
        // means a NETAI user, not merely an account. A resolved "UserPhone"
        // row proves an account exists; it does not prove the person has ever
        // opened Netai, and 62,146 of the 62,184 accounts never have.
        is_member: isMemberPhone(accountStates, row.phone),
        account_state: accountStateFor(accountStates, row.phone),
        netai_subscriber: isSubscriberPhone(accountStates, row.phone),
        via: row.via_names ?? [],
        via_contacts: (row.via_contacts ?? []).map((bridge) => ({
          name: bridge.name,
          phone: bridge.phone,
          is_member: isMemberPhone(accountStates, bridge.phone),
        })),
        // Strongest bridge→target relationship score (enrichment-computed,
        // 0..1) — how warm the best via's own tie to this person is. Missing
        // when no bridge has a computed score. A D34 relationship edge the
        // searcher owns lifts it (never says why — the edge itself is
        // private by design).
        ...(relationshipTouched.has(normalizePhone(row.phone))
          ? { via_warmth: applyRelationshipWarmth(row.warmth) }
          : row.warmth != null && { via_warmth: Number(row.warmth) }),
        // T15: how well this person matches the query, from every tag/fact on
        // them — public or not. Never the matched word itself, only the
        // score. Missing when nothing (public or private) matched at all.
        ...(signalStrength.has(row.phone) && {
          signal_strength: signalStrength.get(row.phone),
        }),
        ...((exclusions.get(phoneDigits(row.phone))?.length ?? 0) > 0 && {
          exclusions: exclusions.get(phoneDigits(row.phone)),
        }),
        // Internal identifiers for agent use — never displayed to the user.
        // target_user_id is set when the person is a registered Ally user;
        // target_phone is set when they are not (unregistered contact).
        ...(row.target_user_id != null
          ? { target_user_id: row.target_user_id }
          : { target_phone: row.phone }),
      };
    });
    // Ticket 16 Task 23: one person, one row, in the second circle too.
    const merged = await collapseMergedPhones(shaped);
    return { found: true, count: merged.rows.length, results: merged.rows };
  } catch (err) {
    console.error('searchSecondDegree error:', (err as Error).message);
    return { found: false, error: (err as Error).message };
  }
}
