import { query } from '../db/postgres/client';
import {
  OWNERSHIP_WORDS,
  PLACE_WORDS,
  PROFESSION_WITH_CLIENTS,
  RELATIONSHIP_WORDS,
  ROLE_WORDS,
  STARTUP_WORDS,
  THING_WORDS,
  TRADE_WORDS,
} from './labelDictionaries';
import { AMBIGUOUS_FIRST_NAMES, GEORGIAN_FIRST_NAMES } from './georgianFirstNames';

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

function tokenize(label: string): string[] {
  return label
    .toLowerCase()
    .split(/[^a-zა-ჿ0-9]+/)
    .filter((t) => t.length >= MIN_TOKEN_LENGTH && /[a-zა-ჿ]/.test(t));
}

function containsAny(haystack: string, words: readonly string[]): boolean {
  const lower = haystack.toLowerCase();
  return words.some((w) => lower.includes(w));
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

export function isNameToken(token: string, firstInLabel: boolean): boolean {
  if (GEORGIAN_FIRST_NAMES.has(token)) return true;
  if (firstInLabel && AMBIGUOUS_FIRST_NAMES.has(token)) return true;
  return [...GEORGIAN_SURNAME_ENDINGS, ...LATIN_SURNAME_ENDINGS].some((ending) =>
    token.endsWith(ending),
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
  if (isNameToken(token, firstInLabel)) return 'name';
  if (containsAny(token, TRADE_WORDS)) return 'trade';
  if (containsAny(token, PROFESSION_WITH_CLIENTS)) return 'profession_with_clients';
  if (containsAny(token, RELATIONSHIP_WORDS)) return 'relation';
  if (containsAny(token, PLACE_WORDS) || containsAny(token, THING_WORDS)) return 'place';
  // A role or an ownership word is the rare label that carries a title. It is
  // not a company either, and `fit` already reads it — so it is set aside
  // rather than counted as the company word.
  if (containsAny(token, ROLE_WORDS) || containsAny(token, OWNERSHIP_WORDS)) return 'role';
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
async function orgSizes(words: string[]): Promise<Map<string, number>> {
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
