import { query } from '../db/postgres/client';
import {
  ANCHORED_SUFFIX_MAX,
  OWNERSHIP_WORDS,
  PLACE_WORDS,
  PROFESSION_WITH_CLIENTS,
  RELATIONSHIP_WORDS,
  ROLE_WORDS,
  SHORT_PLACE_WORDS,
  SHORT_RELATION_WORDS,
  SHORT_THING_WORDS,
  STARTUP_WORDS,
  THING_WORDS,
  TRADE_WORDS,
  NOT_A_WORD,
  IDENTIFIES_NOBODY,
} from './labelDictionaries';
import { AMBIGUOUS_FIRST_NAMES, GEORGIAN_FIRST_NAMES } from './georgianFirstNames';
import { georgianToLatin, hasGeorgian } from './tools/transliterate';

/**
 * Reading a phonebook label for what it can actually say (THE TARGETS 2.2).
 *
 * The founder, 5 September: *"nobody writes Tornike Abuladze Ceo … everyone
 * saves the number as Tornike Ally, or Tornike Abuladze Ally."* A label is
 * written in two seconds by somebody who wants to remember WHERE they met a
 * person, so it carries the company, the trade, the town or the relation —
 * almost never the job title. Counted on 31 August across 34,522 sampled
 * people: 34,499 carry labels and 218 have a job title anywhere.
 *
 * So the label is the TRIGGER and the web is the VERDICT (D113). Nothing here
 * decides that somebody meets the criteria. It decides that he is worth
 * looking up, and says what to type into the search.
 */

const LABEL_QUERY_TIMEOUT_MS = 20_000;

/** Below this a token is noise, not a word. */
const MIN_TOKEN_LENGTH = 3;

/**
 * How many savers must use an organisation word before it belongs to a person.
 * "at least 3 savers, or 20% of his savers" — the percentage catches somebody
 * only five people hold, the absolute catches somebody two hundred do.
 */
const MIN_ORG_SAVERS = 3;
const MIN_ORG_SAVER_SHARE = 0.2;
/**
 * ...and one voice is never a crowd, whatever share it is of a small one.
 *
 * With four savers, 20% is one person — which hands the answer straight back
 * to the single saver who wrote „ORBI IAFAD" on a Batumi flat and put it on
 * the target list. The percentage is there to catch somebody only five people
 * hold; it was never meant to let one of them decide alone.
 */
const MIN_ORG_SAVERS_FOR_SHARE = 2;

/**
 * The size of the company as the phonebooks see it. At or below the small
 * bound, one person carrying the word IS that company; above the big one, the
 * word places him in a crowd and says nothing about his seat.
 *
 * THESE THREE SIT ON AN INFLATED FLOOR, and as of 20 September that is
 * measured rather than suspected. `orgSizes` counts with LIKE '%word%', a
 * SUBSTRING, so its number is always at or above the number of people who
 * really carry the word. TASKS.md held this row shut from 15 September with
 * one sentence: „the full measurement could not be run with ro-sql — the most
 * frequent tokens hit a statement timeout. Until that number exists I do not
 * touch the engine."
 *
 * The number exists now. What was timing out was asking for every token in ONE
 * statement over 8.4 million alias rows; one token costs about 0.25 s in a
 * batch of five, because both counts ride the same trigram index. The wall was
 * the shape of the query. `scripts/ops/orgsize.sh` is the measurement.
 *
 * TWO SAMPLES, because they answer different halves:
 *
 *   the 300 most-carried tokens   median inflation 1.11x, and NOT ONE of them
 *                                 crosses a tier — every frequent word is far
 *                                 above 50 on either count.
 *   rare tokens (two runs,        cross 3:  2% / 1%
 *   220 and 120)                  cross 15: 4% / 5%
 *                                 cross 50: 7% / 10%
 *
 * So the population that moves is small, and every example examined moves in
 * the direction of the truth:
 *
 *   dzgoli        8,108 -> 8      „mdzgoli", „dzgolia" — a driver, not a firm
 *   amila         3,220 -> 25
 *   parikmax      1,236 -> 47     the truncated „parikmaxeri"
 *   berdzen         993 -> 23
 *   შვილო           791 -> 15     inside every -შვილი surname there is
 *   ირგა            196 -> 2
 *
 * `dzgoli` is the whole argument in one line: the engine is told 8,108 people
 * carry that word and therefore that its holder is lost in a crowd. Eight do.
 *
 * WHICH WAY IT WOULD MOVE, since a substring count can only be too high:
 * fixing it makes `runsIt` MORE likely (words fall under 3 and 15) and
 * `in_big_organisation` LESS likely (words fall under 50). Nothing moves up.
 *
 * STILL NOT CHANGED HERE, and now for a different reason than before. It is no
 * longer „we have no number" — it is that this decides who reaches a target
 * list, which is Tornike's call and not a correctness fix I can make on my own
 * (TASKS.md, „სიის სიმძლავრე"). The sampling limit belongs with it: this
 * samples the words in the BASE, not the words the engine asks about, which
 * are only those that passed the saver-agreement gate. Right order of
 * magnitude, not a census.
 */
const SMALL_ORG_SIZE = 15;
const TINY_ORG_SIZE = 3;
const BIG_ORG_SIZE = 50;
/** A startup is smaller still — a very small word next to a startup word. */
const STARTUP_ORG_SIZE = 5;

/** Three organisation words in different directions is the hustler's shape. */
const MIN_DIRECTIONS = 3;

/** What one context token turned out to be. */
export type TokenKind =
  | 'name'
  | 'trade'
  | 'profession_with_clients'
  | 'relation'
  | 'place'
  | 'role'
  /**
   * Junk that reached the label store — not a word anybody typed. Both
   * consumers already ignore every kind but `organisation` and `name`, so this
   * needs nothing from them: naming it is the whole of it. See NOT_A_WORD.
   */
  | 'not_a_word'
  | 'organisation';

export interface LabelSignals {
  /** The company words this person's savers use, most-used first. */
  org_set: string[];
  org_count: number;
  /** Per organisation word: how many people in the base carry it, and his rank. */
  org_detail: { word: string; savers: number; org_size: number; org_rank: number }[];
  /**
   * The name tokens the crowd agreed on, commonest first. The caller needs a
   * NAME to search with; the label carries the company word glued on, and the
   * first live run searched the register for „Levan Shalamberidze Axel Member".
   */
  name_tokens: string[];
  /** Distinct people who saved this number under any label. */
  savers: number;
  /** Distinct labels used for it — how known he is, not how many directions. */
  distinct_labels: number;
  /** L4, the signals Part 3's trigger table switches on. */
  runs_it: boolean;
  in_big_organisation: boolean;
  several_directions: boolean;
  profession_with_clients: boolean;
  startup_hint: boolean;
  axel_hint: boolean;
  trade_only: boolean;
  name_only: boolean;
}

/** One word of a label: the spelling the saver typed, and the folded form. */
export interface LabelToken {
  readonly raw: string;
  readonly lower: string;
}

/**
 * The words of a label in order, each keeping the spelling it was written in.
 *
 * `tokenize` below throws the original away, which is right for every counting
 * question — but a caller that wants to SHOW a word back („TBC Capital", not
 * „tbc capital") has nowhere else to get the casing from. One rule for what a
 * word is, two views of it.
 */
export function labelTokens(label: string): LabelToken[] {
  const out: LabelToken[] = [];
  for (const match of label.matchAll(/[a-zA-Zა-ჿᲐ-Ჿ0-9]+/gu)) {
    const lower = match[0].toLowerCase();
    if (lower.length >= MIN_TOKEN_LENGTH && /[a-zა-ჿ]/.test(lower)) {
      out.push({ raw: match[0], lower });
    }
  }
  return out;
}

function tokenize(label: string): string[] {
  return labelTokens(label).map((t) => t.lower);
}

function containsAny(haystack: string, words: readonly string[]): boolean {
  const lower = haystack.toLowerCase();
  return words.some((w) => lower.includes(w));
}

/**
 * The same question for a word too short to be asked as a substring: is this
 * token THE word, or the word wearing a case ending?
 *
 * Georgian inflects by suffix, so „goris" and „goridan" are the town and have
 * to come through. „igori" and „grigori" are not the town at all, and an
 * anchor at the front is what tells them apart — 175 men called Igor being the
 * measured cost of not having one.
 *
 * AND THE ENDING IS CHECKED AGAINST THE SURNAME LIST. Three letters is exactly
 * „dze": without this second guard „dididze", 117 people, would stop being a
 * family name and become the adjective „big".
 *
 * THE SECOND GUARD, 21 September, and it is what let „papa" in at all.
 *
 * The first guard compares the ENDING to a surname ending, exactly. That is
 * too narrow by one letter, because a surname ending can overlap the word it
 * follows. „papava" is „papa" plus „va" — and „va" is not a surname ending,
 * while „ava" is, and the token ends in it. Measured whole-base: „papava" 671
 * and „პაპავა" 364, a family that `isNameToken` reads correctly as a name
 * TODAY, which the anchored rule would have taken away. „ბაბულია" 57 is the
 * same shape.
 *
 * So a token LONGER than the word, ending in a surname ending, is that
 * family's name rather than the word wearing a case ending. The length test is
 * the whole of the exception: „ბებია" IS the word, ends in „ია", and the
 * grandmother the previous fix was written for must keep coming through.
 */
function endsLikeASurname(lower: string): boolean {
  return ALL_SURNAME_ENDINGS.some((e) => lower.endsWith(e));
}

function matchesAnchored(token: string, words: readonly string[]): boolean {
  const lower = token.toLowerCase();
  return words.some((w) => {
    if (!lower.startsWith(w)) return false;
    const ending = lower.slice(w.length);
    if (ending.length > ANCHORED_SUFFIX_MAX) return false;
    if (ALL_SURNAME_ENDINGS.includes(ending)) return false;
    return ending.length === 0 || !endsLikeASurname(lower);
  });
}

/**
 * L1: is this token the person's NAME?
 *
 * Three ways, in order of certainty: the founder's first-name list, a
 * Georgian surname ending, and — only in a name's position — one of the
 * fifteen names that are also ordinary words. „avto" first in „Avto Kasradze"
 * is a man; „avto" inside „avto servisi" is a car, and reading it as a name
 * there would hide a garage from the trade gate.
 */
const GEORGIAN_SURNAME_ENDINGS = ['შვილი', 'ძე', 'ია', 'ავა', 'ური', 'ელი', 'ანი'];

/**
 * The same endings typed in Latin, which is how much of this base is written —
 * „Burchuladze", „Kikvidze", „Lashkarava". Without them a surname reads as a
 * company word, which is the exact failure the name list exists to prevent.
 *
 * Only the distinctive ones. In Georgian script „ია", „ური", „ელი" and „ანი"
 * are unambiguous; in Latin they are two or three letters that end ordinary
 * words too, and a rule that turns „media" or „safari" into a surname would
 * cost more than it saves. A missed surname becomes an unconfirmed company
 * word and is dropped by the three-saver rule; a wrongly-claimed one silently
 * removes a real signal.
 */
const LATIN_SURNAME_ENDINGS = ['shvili', 'svili', 'dze', 'ava', 'iani'];

/** Both lists, for `matchesAnchored`'s second guard. */
const ALL_SURNAME_ENDINGS: readonly string[] = [
  ...GEORGIAN_SURNAME_ENDINGS,
  ...LATIN_SURNAME_ENDINGS,
];

/**
 * The same token, and its Latin spelling when it was written in Georgian.
 *
 * Ticket 18 [8], the tester's first detail: „ოთარი TBC Insurance" kept „ოთარი"
 * as the company while „Luka TBC Insurance" correctly dropped „Luka". The cause
 * is not the rule, it is the list — it holds 1,062 Latin spellings against 275
 * Georgian ones, so a name present as `otar` is simply absent as `ოთარი`.
 * Transliterating before the lookup closes the whole gap at once rather than
 * one name at a time: `ოთარი` → `otari`, which the list already has.
 */
function spellings(token: string): string[] {
  if (!hasGeorgian(token)) return [token];
  const latin = georgianToLatin(token);
  return latin === token ? [token] : [token, latin];
}

export function isNameToken(token: string, firstInLabel: boolean): boolean {
  const forms = spellings(token);
  if (forms.some((t) => GEORGIAN_FIRST_NAMES.has(t))) return true;
  if (firstInLabel && forms.some((t) => AMBIGUOUS_FIRST_NAMES.has(t))) return true;
  return [...GEORGIAN_SURNAME_ENDINGS, ...LATIN_SURNAME_ENDINGS].some((ending) =>
    forms.some((t) => t.endsWith(ending)),
  );
}

/**
 * L2: which dictionary claims this token.
 *
 * The last line is the one that matters, and it is the founder's own rule:
 * "ORGANISATION = everything else that is not a name and repeats". The
 * dictionaries are small on purpose — they cannot list every company in
 * Georgia, and they do not have to. They list what a company ISN'T.
 */
export function classifyToken(token: string, firstInLabel: boolean): TokenKind {
  // Ticket 18 [8]: a Georgian-script token is asked about in both spellings, so
  // „ოთარი" is recognised as the name the list holds as „otari".
  const forms = spellings(token);
  // A name we KNOW is a name, before anything else.
  if (forms.some((t) => GEORGIAN_FIRST_NAMES.has(t))) return 'name';
  if (firstInLabel && forms.some((t) => AMBIGUOUS_FIRST_NAMES.has(t))) return 'name';
  // Then the dictionaries — BEFORE the surname-ending guess, and this order is
  // the whole point. Georgian builds agent nouns on „-ელი": „დამლაგებელი" (a
  // cleaner) and „მასწავლებელი" (a teacher) both end exactly like a surname.
  // Asked in the other order, the first live run read „დამლაგებელი" as this
  // person's family name and searched the web for it.
  if (containsAny(token, TRADE_WORDS)) return 'trade';
  if (containsAny(token, PROFESSION_WITH_CLIENTS)) return 'profession_with_clients';
  if (containsAny(token, RELATIONSHIP_WORDS)) return 'relation';
  if (containsAny(token, PLACE_WORDS) || containsAny(token, THING_WORDS)) return 'place';
  // A role or an ownership word is the rare label that carries a title. It is
  // not a company either, and `fit` already reads it — so it is set aside
  // rather than counted as the company word.
  if (containsAny(token, ROLE_WORDS) || containsAny(token, OWNERSHIP_WORDS)) return 'role';
  // The commonest words in the whole phonebook, and the last ones to arrive.
  // They are too short to be read as substrings — see the note above
  // SHORT_RELATION_WORDS — so they are asked of the WHOLE token instead, and
  // they are asked here, ahead of the surname ending, for the same reason the
  // dictionaries above are: „ბებია" is a grandmother and it ends in „ია".
  if (matchesAnchored(token, SHORT_RELATION_WORDS)) return 'relation';
  if (matchesAnchored(token, SHORT_PLACE_WORDS) || matchesAnchored(token, SHORT_THING_WORDS))
    return 'place';
  /**
   * LAST BEFORE THE GUESSES, and the position is the whole of it.
   *
   * I put this check FIRST and the suite went red in seven places within the
   * minute: `IDENTIFIES_NOBODY` carries „დედა", „ბებია", „სახლი", „მანქანა" —
   * words this function already classifies CORRECTLY as a relation, a place, a
   * thing. That list means „never print this as somebody's EMPLOYER", which is
   * not the same claim as „this word identifies nobody". A mother identifies a
   * relation. Read first, the list stole every word the dictionaries own.
   *
   * So it is read here: after every dictionary has had its say, before the two
   * guesses at the bottom. It does not overrule knowledge; it replaces a GUESS.
   * `isNameToken` is a surname-shape guess and `organisation` is the
   * give-up — and „klienti" is neither a surname nor a company.
   *
   * The four this was written for, protected in the employer field since
   * 16 September and called organisations by this function ever since:
   * axali 9,784 · klienti 9,470 · chemi 8,724 · ჩემი 7,911.
   */
  if (forms.some((t) => NOT_A_WORD.has(t) || IDENTIFIES_NOBODY.has(t))) return 'not_a_word';
  // Only now the ending: a word no dictionary claims, shaped like a surname.
  if (isNameToken(token, firstInLabel)) return 'name';
  return 'organisation';
}

interface AliasRow {
  phone: string;
  contact_id: string;
  alias: string;
}

/**
 * Every label on these numbers, with who wrote it. One person's labels all
 * come together on one identity before anything is counted (the D35
 * aggregation) — which here means grouping by phone, the identity key.
 */
async function aliasesFor(phones: string[]): Promise<AliasRow[]> {
  if (phones.length === 0) return [];
  const result = await query<AliasRow>(
    `SELECT ua.phone, ua."contactId"::text AS contact_id, ua.alias
     FROM "UserAlias" ua
     WHERE ua.phone = ANY($1)`,
    [phones],
    LABEL_QUERY_TIMEOUT_MS,
  );
  return result.rows;
}

/**
 * L3's second number: how many DIFFERENT people in the whole base carry each
 * of these words. „tbc" runs to thousands, „datamind" to a handful — that
 * difference is the company's size as the phonebooks see it, and it is what
 * separates "he IS this company" from "he works somewhere big".
 */
export async function orgSizes(words: string[]): Promise<Map<string, number>> {
  if (words.length === 0) return new Map();
  const result = await query<{ word: string; org_size: string }>(
    `SELECT w.word, COUNT(DISTINCT ua.phone) AS org_size
     FROM UNNEST($1::text[]) AS w(word)
     JOIN "UserAlias" ua ON lower(ua.alias) LIKE '%' || w.word || '%'
     GROUP BY w.word`,
    [words],
    LABEL_QUERY_TIMEOUT_MS,
  );
  return new Map(result.rows.map((r) => [r.word, Number(r.org_size)]));
}

/**
 * Ticket 19 [8]. The same question as orgSizes, asked properly, for the fields
 * that reach the screen.
 *
 * orgSizes counts with LIKE '%word%' — a SUBSTRING. Measured live on
 * 15 September, that is why „Elen" could be called somebody's employer:
 *
 *   word     as a substring   as a whole word
 *   ──────   ──────────────   ───────────────
 *   and              59,764               923
 *   არა              48,162               230
 *   elen             14,445               112
 *   near                 43                29
 *   tbc               6,369             6,256
 *
 * „elen" was counted out of Elene, Elena, Kelenjeridze; „and" out of
 * Alexander and Sandro. The gate meant to separate companies from names was
 * measuring letter sequences, and a real company barely moves.
 *
 * The second number is what tells a first name from a company even when both
 * are common: a name LEADS its label and a company follows one. Live, again:
 * nino .91, maia .90, elen .73 against tbc .37, capital .10, bank .08.
 *
 * orgSizes itself is deliberately NOT changed here. The target engine reads it
 * through tiers (3 / 15 / 50) that were set against substring counts, and
 * moving the floor under them silently is a bigger change than this item, with
 * its own measuring to do.
 */
export interface OrgWordStat {
  /** People whose label carries this as a whole word. */
  readonly carriers: number;
  /** Of those, the share whose label BEGINS with it. */
  readonly leadShare: number;
}

/**
 * The word goes into a regex, so only plain words are asked about. A token
 * carrying punctuation is not counted rather than escaped: every such token
 * the caller has is already answered by the dictionaries, and a word we
 * cannot count is a word we do not use.
 */
const PLAIN_WORD = /^[\p{L}\p{N}]+$/u;

/**
 * Row 108, fifth cut — this query is the flat cost every second-degree search
 * pays, and it is asking the same questions over and over.
 *
 * Measured, not guessed. The per-lookup timings shipped in 69e43e2 put
 * `decorate` at 1.2-3.1 s on every call, and inside it `labels` was the slowest
 * of the five lookups in EVERY line — and within a few milliseconds of the
 * whole phase each time:
 *
 *   decorate: touched 164 / states 229 / excl 450 / signal 641 / labels 1629
 *   decorate: touched 149 / states 198 / excl 441 / signal 620 / labels 1203
 *   decorate: touched 151 / excl 443 / signal 600 / states 1288 / labels 2437
 *
 * `labels` is rolesFromLabels, and rolesFromLabels is this query. On the live
 * base it costs 586 ms for 20 words and 1,020 ms for 40 (the ceiling the
 * caller asks), because each word joins the 8.4M-row UserAlias on a
 * leading-wildcard LIKE plus a regex — 43,353 rows out of a nested loop for
 * forty words.
 *
 * WHAT IT ANSWERS DOES NOT CHANGE BETWEEN TWO SEARCHES A MINUTE APART. These
 * are corpus statistics — how many people in the whole base carry this word in
 * a label, and how many of them lead with it. They move when somebody edits a
 * phonebook, not when somebody runs a search. Every second-degree call asks
 * about the trade and company words in its own thirty results, and on one base
 * those words repeat constantly.
 *
 * So they are cached per word, ABSENCE INCLUDED. A word the join finds nothing
 * for costs the same scan as one it finds plenty for, and „too few aliases to
 * say" is just as durable an answer as a count — caching only the hits would
 * leave exactly the expensive half uncached.
 */
const ORG_WORD_CACHE_TTL_MS = Number(process.env.ORG_WORD_CACHE_TTL_MINUTES ?? 360) * 60_000;
/** Bounded so a long-lived process cannot grow a dictionary of the whole base. */
const ORG_WORD_CACHE_MAX = 5_000;
const orgWordCache = new Map<string, { stat: OrgWordStat | null; at: number }>();

/** Exported for the tests, which must not depend on another test's warm cache. */
export function clearOrgWordCache(): void {
  orgWordCache.clear();
}

export async function orgWordStats(words: string[]): Promise<Map<string, OrgWordStat>> {
  const asked = [...new Set(words.filter((word) => PLAIN_WORD.test(word)))];
  const out = new Map<string, OrgWordStat>();
  const now = Date.now();
  const missing: string[] = [];
  for (const word of asked) {
    const hit = orgWordCache.get(word);
    if (hit !== undefined && now - hit.at < ORG_WORD_CACHE_TTL_MS) {
      if (hit.stat !== null) out.set(word, hit.stat);
    } else {
      missing.push(word);
    }
  }
  if (missing.length === 0) return out;

  const result = await query<{ word: string; carriers: string; leads: string }>(
    `SELECT w.word,
            COUNT(DISTINCT ua.phone) AS carriers,
            COUNT(DISTINCT ua.phone) FILTER (
              WHERE lower(ua.alias) ~ ('^' || w.word || '([^[:alnum:]]|$)')
            ) AS leads
     FROM UNNEST($1::text[]) AS w(word)
     JOIN "UserAlias" ua
       ON lower(ua.alias) LIKE '%' || w.word || '%'
      AND lower(ua.alias) ~ ('(^|[^[:alnum:]])' || w.word || '([^[:alnum:]]|$)')
     GROUP BY w.word`,
    [missing],
    LABEL_QUERY_TIMEOUT_MS,
  );
  // Written only AFTER the query returns. A throw leaves the cache untouched,
  // so a failed call is retried next time rather than remembered as „nothing".
  if (orgWordCache.size + missing.length > ORG_WORD_CACHE_MAX) orgWordCache.clear();
  const found = new Set<string>();
  for (const row of result.rows) {
    const carriers = Number(row.carriers);
    const stat: OrgWordStat = {
      carriers,
      leadShare: carriers > 0 ? Number(row.leads) / carriers : 0,
    };
    out.set(row.word, stat);
    orgWordCache.set(row.word, { stat, at: now });
    found.add(row.word);
  }
  for (const word of missing) {
    if (!found.has(word)) orgWordCache.set(word, { stat: null, at: now });
  }
  return out;
}

/** Aliases sampled per word when asking whether the word is a company. */
const COMPANY_WORD_ALIAS_SAMPLE = 150;
/** Fewer aliases than this say nothing about a word. */
const COMPANY_WORD_MIN_ALIASES = 3;
/** Above this share of aliases carrying somebody ELSE's surname or a title, the word is a company. */
const COMPANY_WORD_SHARE = 0.2;
const COMPANY_WORD_TIMEOUT_MS = 20_000;
/**
 * The whole loop's wall clock, not one word's.
 *
 * A per-query timeout bounds a query; it does not bound an answer. This is the
 * only number that bounds the answer.
 */
const COMPANY_WORD_BUDGET_MS = Number(process.env.COMPANY_WORD_BUDGET_MS ?? 5_000);

function isSurnameShaped(token: string): boolean {
  if (GEORGIAN_FIRST_NAMES.has(token)) return false;
  return [...GEORGIAN_SURNAME_ENDINGS, ...LATIN_SURNAME_ENDINGS].some((e) => token.endsWith(e));
}

/**
 * Is a word no dictionary knows a COMPANY or a SURNAME? Counting numbers does
 * not tell them apart — „boxua" is on 254 numbers because it is a common
 * surname, „maxin" on nine because the company is small. What tells them apart
 * is the company: its word travels next to OTHER people's surnames and titles
 * („Lika Chkhirodze Maxin AI", „Maxin.ai Ceo"); a surname travels next to first
 * names only („Ana Boxua"). Returns, per word, the share of aliases carrying it
 * that also carry another surname-shaped token or a role word; words with too
 * few aliases are absent (Ticket 13 Task 18).
 */
/**
 * Ticket 19, found in the production log and then in the query plan.
 *
 * This read was one statement carrying N words through a LATERAL:
 *
 *   FROM UNNEST($1::text[]) AS w(word)
 *   CROSS JOIN LATERAL (SELECT ua.alias FROM "UserAlias" ua
 *                       WHERE lower(ua.alias) LIKE '%' || w.word || '%' ...)
 *
 * The pattern is built from a COLUMN, so nothing is known when the statement
 * is planned, pg_trgm cannot extract trigrams from it, and the whole thing
 * falls to a SEQUENTIAL SCAN. EXPLAIN on prod, 15 September:
 *
 *   literal pattern  -> Bitmap Index Scan on idx_user_alias_trgm
 *   through LATERAL  -> Seq Scan, no index at all
 *
 * That is the ~2.3s per word, the 9-20s per batch, and the timeouts the log
 * was recording on every run. The index has been there the whole time; the
 * shape of the query hid it.
 *
 * So each word is now asked for on its own, with the pattern as a PARAMETER
 * rather than built from a column. node-postgres sends these as unnamed
 * prepared statements, which Postgres re-plans per execution with the value
 * in hand — so the pattern is known, the trigram index is used, and the same
 * word measures ~20-250ms instead of ~2,300ms.
 *
 * Sequential rather than parallel on purpose: the main pool holds ten
 * connections and a person's own search must not queue behind a background
 * read. Twenty words at a few tens of milliseconds is a second in total,
 * against the ~56s the batched form was spending to answer nothing.
 *
 * AND THE LOOP HAS A CLOCK, added the same day and for a reason found six
 * hours later. „A second in total" is the happy path. Each word carries a
 * 20-second timeout and nothing bounded how many words there were, so the
 * unhappy path is twenty of those in a row — every one of them honouring its
 * budget, and the caller waiting minutes. That is exactly the shape that made
 * get_pending_updates take 74,871 ms out of parts that were all inside their
 * limits, and this loop sits on the same path: buildTargetList feeds tier one
 * of the curiosity queue, which runs when a conversation opens.
 *
 * Stopping early is safe BY CONSTRUCTION and that is why a budget is the right
 * answer here rather than a bigger machine: a word with no answer is simply
 * absent from the map, and isCompanyWordShare reads absent as „not a company",
 * the cautious direction. The words that were not asked are named in the log,
 * because a silent partial answer is the thing this whole week has been about.
 *
 * The words come from labelTokens, which yields letters and digits only, so
 * no LIKE wildcard can arrive inside one. If that ever stops being true, the
 * pattern must be escaped before it goes in.
 */

export async function companyWordShare(words: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (words.length === 0) return out;
  // LIKE, not a regex: the regex form timed out on the live base even for two
  // words. The substring read is fast; the whole-word test is done here. Read
  // in chunks so one slow word cannot sink the whole batch.
  const rows: { word: string; alias: string }[] = [];
  const startedAt = Date.now();
  for (const [index, word] of words.entries()) {
    if (Date.now() - startedAt > COMPANY_WORD_BUDGET_MS) {
      // eslint-disable-next-line no-console
      console.warn(
        `[label-reader] company-word budget spent after ${index} of ${words.length} words; ` +
          `the rest are treated as not-a-company: ${words.slice(index).join(', ')}`,
      );
      break;
    }
    try {
      const result = await query<{ alias: string }>(
        `SELECT ua.alias FROM "UserAlias" ua
         WHERE lower(ua.alias) LIKE $1
         LIMIT ${COMPANY_WORD_ALIAS_SAMPLE}`,
        [`%${word}%`],
        COMPANY_WORD_TIMEOUT_MS,
      );
      for (const row of result.rows) rows.push({ word, alias: row.alias });
    } catch (err) {
      // One word's failure is one word's, never the call's. Without a catch
      // here the throw left the loop and lost every word — which is what the
      // log had been recording.
      //
      // Safe to continue on partial data by construction: a word with no
      // answer is absent from the map, and isCompanyWordShare reads absent as
      // „not a company", which is the cautious direction.
      // eslint-disable-next-line no-console
      console.warn(`[label-reader] company-word read failed (${word}):`, (err as Error).message);
    }
  }
  const perWord = new Map<string, { aliases: number; company: number }>();
  for (const row of rows) {
    const tokens = tokenize(row.alias);
    if (!tokens.includes(row.word)) continue;
    const stat = perWord.get(row.word) ?? { aliases: 0, company: 0 };
    stat.aliases += 1;
    const others = tokens.filter((t) => t !== row.word);
    const nextToOthers = others.some(
      (t) => isSurnameShaped(t) || containsAny(t, ROLE_WORDS) || containsAny(t, OWNERSHIP_WORDS),
    );
    if (nextToOthers) stat.company += 1;
    perWord.set(row.word, stat);
  }
  for (const [word, stat] of perWord) {
    if (stat.aliases >= COMPANY_WORD_MIN_ALIASES) out.set(word, stat.company / stat.aliases);
  }
  return out;
}

/** True when the share says company (see companyWordShare). */
export function isCompanyWordShare(share: number | undefined): boolean {
  return share !== undefined && share >= COMPANY_WORD_SHARE;
}

/**
 * L3's third number: this person's rank, by how many phonebooks hold him,
 * among everybody carrying the word. The most-saved person with a small
 * company's word is that company's face — which is the "runs it" signal, and
 * the one the register is then asked to confirm.
 */
async function orgRanks(pairs: { phone: string; word: string }[]): Promise<Map<string, number>> {
  if (pairs.length === 0) return new Map();
  const result = await query<{ phone: string; word: string; rank: string }>(
    `WITH pair(phone, word) AS (SELECT * FROM UNNEST($1::text[], $2::text[])),
     holders AS (
       SELECT p.phone AS subject, p.word, ua.phone AS other,
              COUNT(DISTINCT ua."contactId") AS reach
       FROM pair p
       JOIN "UserAlias" ua ON lower(ua.alias) LIKE '%' || p.word || '%'
       GROUP BY p.phone, p.word, ua.phone
     )
     SELECT subject AS phone, word,
            (SELECT COUNT(*) + 1 FROM holders b
             WHERE b.word = h.word AND b.subject = h.subject AND b.reach > h.reach)::text AS rank
     FROM holders h
     WHERE h.other = h.subject`,
    [pairs.map((p) => p.phone), pairs.map((p) => p.word)],
    LABEL_QUERY_TIMEOUT_MS,
  );
  return new Map(result.rows.map((r) => [`${r.phone}|${r.word}`, Number(r.rank)]));
}

/**
 * L1–L4 for each of these numbers.
 *
 * Two round trips beyond the labels themselves: one for how big each company
 * word is across the base, one for where this person ranks inside it. Both are
 * asked once for the whole batch.
 */
export async function readLabels(phones: string[]): Promise<Map<string, LabelSignals>> {
  const rows = await aliasesFor(phones);
  const byPhone = new Map<string, AliasRow[]>();
  for (const row of rows) {
    const list = byPhone.get(row.phone) ?? [];
    list.push(row);
    byPhone.set(row.phone, list);
  }

  // Pass one: tokenise and classify, per person, without any global counts.
  interface Draft {
    savers: Set<string>;
    labels: Set<string>;
    orgSavers: Map<string, Set<string>>;
    nameSavers: Map<string, Set<string>>;
    kinds: Set<TokenKind>;
    startupWord: boolean;
  }
  const drafts = new Map<string, Draft>();
  for (const [phone, aliases] of byPhone) {
    const draft: Draft = {
      savers: new Set(),
      labels: new Set(),
      orgSavers: new Map(),
      nameSavers: new Map(),
      kinds: new Set(),
      startupWord: false,
    };
    for (const row of aliases) {
      draft.savers.add(row.contact_id);
      draft.labels.add(row.alias);
      const tokens = tokenize(row.alias);
      tokens.forEach((token, index) => {
        if (containsAny(token, STARTUP_WORDS)) draft.startupWord = true;
        const kind = classifyToken(token, index === 0);
        draft.kinds.add(kind);
        const bucket =
          kind === 'organisation' ? draft.orgSavers : kind === 'name' ? draft.nameSavers : null;
        if (bucket === null) return;
        const savers = bucket.get(token) ?? new Set();
        savers.add(row.contact_id);
        bucket.set(token, savers);
      });
    }
    drafts.set(phone, draft);
  }

  // Pass two: keep only the org words the crowd actually agrees on, then ask
  // the base how big each one is and where this person sits inside it.
  const kept = new Map<string, string[]>();
  for (const [phone, draft] of drafts) {
    const words: string[] = [];
    for (const [word, savers] of draft.orgSavers) {
      const share = savers.size / Math.max(1, draft.savers.size);
      const agreed =
        savers.size >= MIN_ORG_SAVERS ||
        (savers.size >= MIN_ORG_SAVERS_FOR_SHARE && share >= MIN_ORG_SAVER_SHARE);
      if (agreed) words.push(word);
    }
    words.sort((a, b) => (draft.orgSavers.get(b)?.size ?? 0) - (draft.orgSavers.get(a)?.size ?? 0));
    kept.set(phone, words);
  }
  const allWords = [...new Set([...kept.values()].flat())];
  const pairs = [...kept].flatMap(([phone, words]) => words.map((word) => ({ phone, word })));
  const [sizes, ranks] = await Promise.all([orgSizes(allWords), orgRanks(pairs)]);

  const out = new Map<string, LabelSignals>();
  for (const [phone, draft] of drafts) {
    const words = kept.get(phone) ?? [];
    const detail = words.map((word) => ({
      word,
      savers: draft.orgSavers.get(word)?.size ?? 0,
      org_size: sizes.get(word) ?? 0,
      org_rank: ranks.get(`${phone}|${word}`) ?? 0,
    }));
    const runsIt = detail.some(
      (d) =>
        d.org_size <= TINY_ORG_SIZE ||
        (d.org_size > 0 && d.org_size <= SMALL_ORG_SIZE && d.org_rank === 1),
    );
    // Against the AGREED words, not the raw tokens. L2's own line: "a token
    // that appears once, for one person, from one saver, stays unclassified
    // and counts for nothing" — so one saver's „orbiiafad" must not be able to
    // argue a plumber out of the trade gate.
    const onlyTrade = draft.kinds.has('trade') && words.length === 0;
    const nameTokens = [...draft.nameSavers.entries()]
      .sort((a, b) => b[1].size - a[1].size)
      .map(([token]) => token);
    out.set(phone, {
      org_set: words,
      name_tokens: nameTokens,
      org_count: words.length,
      org_detail: detail,
      savers: draft.savers.size,
      distinct_labels: draft.labels.size,
      runs_it: runsIt,
      in_big_organisation: detail.some((d) => d.org_size > BIG_ORG_SIZE),
      several_directions: words.length >= MIN_DIRECTIONS,
      profession_with_clients:
        draft.kinds.has('profession_with_clients') && !draft.kinds.has('trade'),
      startup_hint: draft.startupWord || detail.some((d) => d.org_size <= STARTUP_ORG_SIZE),
      axel_hint: words.some((w) => w.includes('axel')),
      trade_only: onlyTrade,
      // Nothing but a name, or a name and a relation or a place. Never a
      // target as written — but never dropped either: another saver may give
      // a real word tomorrow.
      name_only:
        words.length === 0 &&
        !draft.kinds.has('trade') &&
        !draft.kinds.has('profession_with_clients'),
    });
  }
  return out;
}
