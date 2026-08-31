import { query } from '../db/postgres/client';
import { findUnmetNeeds, UnmetNeed } from './unmetNeeds.service';
import { normalizePhone } from './phone';
import {
  MONTHLY_GROWTH_ASK_BUDGET_BASE,
  MONTHLY_GROWTH_ASK_BUDGET_LADDER,
  FATIGUE_STEP_DOWN_PER_SIGNAL,
} from './askBudget.service';

const SCORE_QUERY_TIMEOUT_MS = 8_000;
// Must mirror askBudget.service's own fatigue window — this is the same
// signal, read here in aggregate rather than per-sender.
const IGNORED_ASK_AFTER_HOURS = 168;

// T7: weekly scored list of non-users per market. All five criteria flags are
// built. The two that were once reported unbuildable joined in ticket 7 task
// 15: "relevance to a specific user's goals" reads the tasks table (the goals
// ARE tasks — the earlier "no goals table" note was wrong), and "lookalike
// match to our best users" uses the founder's D50 definition of a best user —
// any one of: a confirmed search outcome in the last 30 days, three paid
// months, or using Netai at least once a week.

// Score-part weights and saturation points — a handful of holders (Reach) or
// matched searches (Pull) already carries the same signal as a hundred would,
// so each part is capped before combining rather than left unbounded.
const REACH_SATURATION = 10;
const PULL_SATURATION = 5;
const REACH_WEIGHT = 0.35;
const PULL_WEIGHT = 0.35;
const WARMTH_WEIGHT = 0.3;
const NEEDS_NETAI_BONUS = 0.1;
const GAP_FILLING_BONUS = 0.05;
// Ticket 7 task 15: the two remaining criteria flags. A target an open goal
// is actually looking for outranks a merely-popular one; a lookalike bonus is
// softer — a correlation, not a demand signal.
const GOAL_RELEVANCE_BONUS = 0.1;
const BEST_USER_LOOKALIKE_BONUS = 0.05;

// D50's best-user definition, verbatim: any ONE of the three qualifies.
const BEST_USER_OUTCOME_DAYS = 30;
const BEST_USER_PAID_MONTHS = 3;
// "uses Netai at least once a week", read over the last four weeks: a chat
// run in four distinct weeks (token_transactions' chat_debit rows — every
// conversation run writes one, the broadest real usage signal in the schema).
const BEST_USER_ACTIVE_WEEKS = 4;
const BEST_USER_ACTIVITY_WINDOW_DAYS = 28;
// A "confirmed outcome" is any rung at or beyond accepted on D39's ladder.
const CONFIRMED_OUTCOMES = ['accepted', 'sent', 'replied', 'followed_up'];
// The lookalike vocabulary comes from the trade-shaped facts recorded about
// best users themselves — occupations match occupations, never name tokens.
const LOOKALIKE_FACT_TYPES = ['occupation', 'industry', 'employer'];
// A topic this scarce in candidates (this or fewer non-user matches) counts
// its matched trade as gap-filling — genuinely hard to find in the network.
const GAP_FILLING_POOL_THRESHOLD = 2;

const OLD_ALLY_COLOUR_BONUS: Record<string, number> = {
  allies: 0.3,
  loyal: 0.2,
  connections: 0.1,
  contacts: 0.05,
};
const OLD_ALLY_COLOUR_RANK = ['allies', 'loyal', 'connections', 'contacts'];
const FACT_BONUS_PER_FACT = 0.05;
const FACT_BONUS_CAP = 0.2;

// Explainable keyword flag, not a classifier — the spec's own examples
// (business owner, hirer, organiser). Deliberately short: a false negative
// here only withholds a small bonus already backed by Reach/Pull/Warmth; a
// false positive would misrepresent why someone was ranked highly.
const NEEDS_NETAI_KEYWORDS = [
  'დირექტორი',
  'დამფუძნებელი',
  'მფლობელი',
  'მენეჯერი',
  'ხელმძღვანელი',
  'director',
  'founder',
  'owner',
  'ceo',
  'hr',
  'recruiter',
  'ორგანიზატორი',
  'organizer',
];

// ─── Ticket 7 Task 4 item 1: a target must be a PERSON ─────────────────────
// The signals used, stated per the tester's own ask ("change them if you
// have better signals, but say which you used"):
//   HARD EXCLUDE (never on the list):
//   - phone not a Georgian personal mobile (+9955########, 13 chars after
//     normalizePhone) — kills 0-800 hotlines, short codes and anything that
//     normalised to a foreign prefix out of a Georgian phonebook;
//   - a brand/company stoplist word is the phone's MOST FREQUENT alias token
//     AND reach > 100 — the tester's own draft, literally (wissol at reach
//     644, maksima, a bank line). Reach alone is deliberately NOT an
//     exclusion: a popular tradesman ("დათო ვეტერინარი", reach 143) is a
//     person; his top token is his trade or name, not a brand.
//   RANK, not exclude:
//   - person_confirmed = at least 2 distinct contributors saved this phone
//     with aliases sharing a non-stoplist word token (people are known by
//     the same name across phonebooks; unconfirmed phones sort last).
const GEORGIAN_MOBILE_RE = /^\+9955\d{8}$/;
const HOTLINE_REACH_THRESHOLD = 100;
const BRAND_STOPLIST: ReadonlySet<string> = new Set([
  'wissol',
  'rompetrol',
  'socar',
  'sokari',
  'maksima',
  'gulf',
  'magti',
  'magticom',
  'silknet',
  'geocell',
  'beeline',
  'bank',
  'banki',
  'tbc',
  'bog',
  'liberty',
  'servisi',
  'service',
  'servis',
  'delivery',
  'express',
  'hotline',
  'taxi',
  'taksi',
]);
// How many aliases per phone the token analysis samples — enough to see the
// dominant token on a hotline without pulling a 644-row fan-in whole.
const ALIAS_SAMPLE_PER_PHONE = 25;
const MIN_TOKEN_LENGTH = 3;

export interface TargetScoreParts {
  reach: number;
  pull: number;
  warmth: number;
  needs_netai_signs: boolean;
  gap_filling_trade: boolean;
  // An OPEN goal of an active subscriber whole-word-matches this target's
  // label — someone on Netai is looking for exactly this right now.
  goal_relevant: boolean;
  // The target's label shares a trade token with facts recorded about D50's
  // best users — the people Netai demonstrably works for.
  best_user_lookalike: boolean;
  // ≥2 distinct contributors know this phone by a shared, non-brand name
  // token — the "this is a person" signal. Unconfirmed entries rank last.
  person_confirmed: boolean;
  // How many active/trialing subscribers (with human-sized phonebooks — the
  // same predicate as the registration gate's social proof) hold this number.
  // The founder's target rule (31 Aug, via Misho): invite ONLY people the
  // door would let in, i.e. holders >= the gate's own threshold.
  subscribed_holders: number;
}

export interface TargetScoreEntry {
  phone: string;
  label: string;
  // Same "market" limitation as T6(b): the ASKER's city from a matched
  // topic, not a location the non-user actually reported.
  city: string | null;
  score: number;
  parts: TargetScoreParts;
}

interface CandidateContext {
  label: string;
  city: string | null;
  pull: number;
  smallestPoolForItsTopics: number;
}

function gatherCandidates(needs: UnmetNeed[]): Map<string, CandidateContext> {
  const byPhone = new Map<string, CandidateContext>();
  for (const need of needs) {
    for (const candidate of need.candidates) {
      const existing = byPhone.get(candidate.phone);
      if (existing) {
        existing.pull += 1;
        existing.smallestPoolForItsTopics = Math.min(
          existing.smallestPoolForItsTopics,
          need.candidates.length,
        );
        existing.city = existing.city ?? need.city;
      } else {
        byPhone.set(candidate.phone, {
          label: candidate.label,
          city: need.city,
          pull: 1,
          smallestPoolForItsTopics: need.candidates.length,
        });
      }
    }
  }
  return byPhone;
}

/** Reach: how many users have this phone saved — current Netai contacts UNION old-Ally connections. */
async function reachForPhones(phones: string[]): Promise<Map<string, number>> {
  if (phones.length === 0) return new Map();
  const result = await query<{ phone: string; reach: string }>(
    `SELECT phone, COUNT(DISTINCT uid) AS reach FROM (
       SELECT phone, "contactId"::text AS uid FROM "UserAlias" WHERE phone = ANY($1)
       UNION
       SELECT ucp.phone, uc."originUserId"::text AS uid
       FROM "UserConnectionPhone" ucp JOIN "UserConnection" uc ON uc.id = ucp."connectionId"
       WHERE ucp.phone = ANY($1)
     ) x GROUP BY phone`,
    [phones],
    SCORE_QUERY_TIMEOUT_MS,
  );
  return new Map(result.rows.map((r) => [r.phone, Number(r.reach)]));
}

interface WarmthSignals {
  strength: number;
  colour: string | null;
  factCount: number;
}

/**
 * Warmth inputs: the best (max) machine-computed relationship strength any
 * user has toward this phone, their old-Ally colour (queried live off
 * UserConnection/UserConnectionPhone — human_relationship_tiers, the
 * backfilled copy of the same data, is still empty pending an admin-token
 * run this session doesn't have), and how many facts exist about them.
 */
async function warmthSignalsForPhones(phones: string[]): Promise<Map<string, WarmthSignals>> {
  if (phones.length === 0) return new Map();
  const [strengthRows, colourRows, factRows] = await Promise.all([
    query<{ contact_phone: string; strength: number }>(
      `SELECT contact_phone, MAX(strength_score) AS strength
       FROM contact_relationship_scores WHERE contact_phone = ANY($1) GROUP BY contact_phone`,
      [phones],
      SCORE_QUERY_TIMEOUT_MS,
    ),
    query<{ phone: string; status: string }>(
      `SELECT ucp.phone, uc."relationshipStatus" AS status
       FROM "UserConnectionPhone" ucp JOIN "UserConnection" uc ON uc.id = ucp."connectionId"
       WHERE ucp.phone = ANY($1) AND uc."relationshipStatus" IN ('allies', 'loyal', 'connections', 'contacts')`,
      [phones],
      SCORE_QUERY_TIMEOUT_MS,
    ),
    query<{ phone: string; cnt: string }>(
      `SELECT neo4j_contact_id AS phone, COUNT(*) AS cnt FROM contact_facts
       WHERE neo4j_contact_id = ANY($1) AND retracted_at IS NULL GROUP BY neo4j_contact_id`,
      [phones],
      SCORE_QUERY_TIMEOUT_MS,
    ),
  ]);
  const strengthMap = new Map(strengthRows.rows.map((r) => [r.contact_phone, Number(r.strength)]));
  const colourMap = new Map<string, string>();
  for (const row of colourRows.rows) {
    const current = colourMap.get(row.phone);
    if (
      !current ||
      OLD_ALLY_COLOUR_RANK.indexOf(row.status) < OLD_ALLY_COLOUR_RANK.indexOf(current)
    ) {
      colourMap.set(row.phone, row.status);
    }
  }
  const factMap = new Map(factRows.rows.map((r) => [r.phone, Number(r.cnt)]));
  const result = new Map<string, WarmthSignals>();
  for (const phone of phones) {
    result.set(phone, {
      strength: strengthMap.get(phone) ?? 0,
      colour: colourMap.get(phone) ?? null,
      factCount: factMap.get(phone) ?? 0,
    });
  }
  return result;
}

function warmthScore(signals: WarmthSignals): number {
  const colourBonus = signals.colour ? (OLD_ALLY_COLOUR_BONUS[signals.colour] ?? 0) : 0;
  const factBonus = Math.min(FACT_BONUS_CAP, signals.factCount * FACT_BONUS_PER_FACT);
  return Math.min(1, signals.strength * 0.5 + colourBonus + factBonus);
}

function hasNeedsNetaiSignal(label: string): boolean {
  const lower = label.toLowerCase();
  return NEEDS_NETAI_KEYWORDS.some((kw) => lower.includes(kw.toLowerCase()));
}

interface AliasAnalysis {
  /** Most frequent alias token across contributors (normalized), if any. */
  topToken: string | null;
  /** ≥2 distinct contributors share a non-stoplist token — the person test. */
  personConfirmed: boolean;
}

function tokenize(label: string): string[] {
  return label
    .toLowerCase()
    .split(/[^a-zა-ჿ0-9]+/)
    .filter((t) => t.length >= MIN_TOKEN_LENGTH && /[a-zა-ჿ]/.test(t));
}

/**
 * Samples up to ALIAS_SAMPLE_PER_PHONE aliases per phone (LATERAL, 21ms for
 * 3 phones via idx_user_alias_phone — EXPLAIN ANALYZE on prod) and computes
 * the two Task 4 person-signals per phone: the dominant token (the hotline
 * test's input) and whether ≥2 distinct contributors share a non-brand token.
 */
async function analyzeAliases(phones: string[]): Promise<Map<string, AliasAnalysis>> {
  const result = new Map<string, AliasAnalysis>();
  if (phones.length === 0) return result;
  const rows = await query<{ phone: string; contactId: number; alias: string }>(
    `SELECT p.phone, a."contactId", a.alias
     FROM UNNEST($1::text[]) AS p(phone)
     CROSS JOIN LATERAL (
       SELECT "contactId", alias FROM "UserAlias" ua WHERE ua.phone = p.phone
       LIMIT ${ALIAS_SAMPLE_PER_PHONE}
     ) a`,
    [phones],
    SCORE_QUERY_TIMEOUT_MS,
  );

  const byPhone = new Map<string, { contactId: number; tokens: string[] }[]>();
  for (const row of rows.rows) {
    if (!byPhone.has(row.phone)) byPhone.set(row.phone, []);
    byPhone.get(row.phone)?.push({ contactId: row.contactId, tokens: tokenize(row.alias) });
  }

  for (const phone of phones) {
    const entries = byPhone.get(phone) ?? [];
    const tokenCounts = new Map<string, number>();
    const tokenContributors = new Map<string, Set<number>>();
    for (const entry of entries) {
      for (const token of new Set(entry.tokens)) {
        tokenCounts.set(token, (tokenCounts.get(token) ?? 0) + 1);
        if (!tokenContributors.has(token)) tokenContributors.set(token, new Set());
        tokenContributors.get(token)?.add(entry.contactId);
      }
    }
    let topToken: string | null = null;
    let topCount = 0;
    for (const [token, count] of tokenCounts) {
      // Deterministic: ties broken alphabetically, never by Map order.
      if (count > topCount || (count === topCount && topToken !== null && token < topToken)) {
        topToken = token;
        topCount = count;
      }
    }
    const personConfirmed = Array.from(tokenContributors.entries()).some(
      ([token, contributors]) => !BRAND_STOPLIST.has(token) && contributors.size >= 2,
    );
    result.set(phone, { topToken, personConfirmed });
  }
  return result;
}

/**
 * D50's best users, exactly as ruled: active subscribers with ANY one of a
 * confirmed outcome (a rung at or beyond accepted) in the last 30 days,
 * three paid months (distinct monthly token grants), or a chat run in each
 * of the last four weeks.
 */
async function bestUserIds(): Promise<number[]> {
  const result = await query<{ id: number }>(
    `SELECT u.id FROM "User" u
     WHERE u.subscription_status = 'active' AND (
       EXISTS (
         SELECT 1 FROM search_activity sa
         WHERE sa.user_id = u.id::text AND sa.outcome = ANY($1)
           AND sa.outcome_updated_at > NOW() - make_interval(days => $2)
       )
       OR (
         SELECT COUNT(DISTINCT tt.period_key) FROM token_transactions tt
         WHERE tt.user_id = u.id::text AND tt.reason = 'monthly_grant'
       ) >= $3
       OR (
         SELECT COUNT(DISTINCT date_trunc('week', tt.created_at)) FROM token_transactions tt
         WHERE tt.user_id = u.id::text AND tt.reason = 'chat_debit'
           AND tt.created_at > NOW() - make_interval(days => $4)
       ) >= $5
     )`,
    [
      CONFIRMED_OUTCOMES,
      BEST_USER_OUTCOME_DAYS,
      BEST_USER_PAID_MONTHS,
      BEST_USER_ACTIVITY_WINDOW_DAYS,
      BEST_USER_ACTIVE_WEEKS,
    ],
    SCORE_QUERY_TIMEOUT_MS,
  );
  return result.rows.map((r) => r.id);
}

/**
 * The trade tokens describing best users — occupation/industry/employer fact
 * values recorded about their own phones, tokenized, brand words out. Name
 * tokens never enter (facts carry trades, not names), so a lookalike match
 * means "same kind of person", never "same first name".
 */
async function bestUserVocabulary(): Promise<Set<string>> {
  const ids = await bestUserIds();
  if (ids.length === 0) return new Set();
  const phoneRows = await query<{ phone: string }>(
    `SELECT phone FROM "UserPhone" WHERE "userId" = ANY($1)`,
    [ids],
    SCORE_QUERY_TIMEOUT_MS,
  );
  const phones = Array.from(
    new Set(phoneRows.rows.map((r) => normalizePhone(r.phone)).filter((p) => p !== '')),
  );
  if (phones.length === 0) return new Set();
  const facts = await query<{ value: string }>(
    `SELECT value FROM contact_facts
     WHERE neo4j_contact_id = ANY($1) AND field_type = ANY($2) AND retracted_at IS NULL`,
    [phones, LOOKALIKE_FACT_TYPES],
    SCORE_QUERY_TIMEOUT_MS,
  );
  const vocabulary = new Set<string>();
  for (const row of facts.rows) {
    for (const token of tokenize(row.value)) {
      if (!BRAND_STOPLIST.has(token)) vocabulary.add(token);
    }
  }
  return vocabulary;
}

/**
 * Which candidate phones an OPEN goal is actually looking for: each label
 * word matched whole-word (`<<%`, the same strict word-similarity operator
 * the unmet-needs matching uses — goal text is inflected prose, so exact
 * token equality would miss "სანტექნიკოსი" inside "სანტექნიკოსს ვეძებ")
 * against active subscribers' open tasks. Explainable and per-goal real —
 * the criterion the earlier "no goals table" note wrongly skipped.
 */
async function goalRelevantPhones(candidates: Map<string, CandidateContext>): Promise<Set<string>> {
  const pairPhones: string[] = [];
  const pairWords: string[] = [];
  for (const [phone, ctx] of candidates) {
    for (const word of new Set(tokenize(ctx.label))) {
      if (BRAND_STOPLIST.has(word)) continue;
      pairPhones.push(phone);
      pairWords.push(word);
    }
  }
  if (pairPhones.length === 0) return new Set();
  const result = await query<{ phone: string }>(
    `SELECT DISTINCT x.phone
     FROM UNNEST($1::text[], $2::text[]) AS x(phone, word)
     WHERE EXISTS (
       SELECT 1 FROM tasks t
       -- tasks.user_id is TEXT on prod while "User".id is INTEGER — compare
       -- as text (live-caught: integer = text 500'd the whole target list).
       JOIN "User" u ON u.id::text = t.user_id AND u.subscription_status = 'active'
       WHERE t.status = 'open'
         AND normalize_search_token(x.word) <<% normalize_search_token(
           COALESCE(t.title, '') || ' ' || COALESCE(t.description, '') || ' ' || COALESCE(t.brief, ''))
     )`,
    [pairPhones, pairWords],
    SCORE_QUERY_TIMEOUT_MS,
  );
  return new Set(result.rows.map((r) => r.phone));
}

function isGeorgianPersonalMobile(phone: string): boolean {
  return GEORGIAN_MOBILE_RE.test(phone);
}

function isHotline(analysis: AliasAnalysis | undefined, reach: number): boolean {
  if (reach <= HOTLINE_REACH_THRESHOLD) return false;
  const topToken = analysis?.topToken;
  return topToken != null && BRAND_STOPLIST.has(topToken);
}

function combinedScore(parts: {
  reach: number;
  pull: number;
  warmth: number;
  needsNetai: boolean;
  gapFilling: boolean;
  goalRelevant: boolean;
  bestUserLookalike: boolean;
}): number {
  const normReach = Math.min(1, parts.reach / REACH_SATURATION);
  const normPull = Math.min(1, parts.pull / PULL_SATURATION);
  let score = normReach * REACH_WEIGHT + normPull * PULL_WEIGHT + parts.warmth * WARMTH_WEIGHT;
  if (parts.needsNetai) score += NEEDS_NETAI_BONUS;
  if (parts.gapFilling) score += GAP_FILLING_BONUS;
  if (parts.goalRelevant) score += GOAL_RELEVANCE_BONUS;
  if (parts.bestUserLookalike) score += BEST_USER_LOOKALIKE_BONUS;
  return Math.min(1, score);
}

/**
 * "List size is driven by ask capacity... not a fixed number": counts active
 * subscribers who have NOT yet used up their T10 monthly growth-ask budget
 * this month — the exact same formula askBudget.service applies per sender,
 * read here in aggregate.
 */
export async function countAskableUsers(): Promise<number> {
  const monthlyBudget = MONTHLY_GROWTH_ASK_BUDGET_BASE * MONTHLY_GROWTH_ASK_BUDGET_LADDER;
  const result = await query<{ count: string }>(
    `SELECT COUNT(*) AS count FROM (
       SELECT u.id,
         COALESCE(sent.cnt, 0) AS sent_this_month,
         COALESCE(optout.cnt, 0) + COALESCE(ignored.cnt, 0) AS fatigue_signals
       FROM "User" u
       LEFT JOIN (
         SELECT from_user_id, COUNT(*) AS cnt FROM task_asks
         WHERE parent_ask_id IS NULL AND created_at > date_trunc('month', NOW())
         GROUP BY from_user_id
       ) sent ON sent.from_user_id = u.id
       LEFT JOIN (
         SELECT user_id, COUNT(*) AS cnt FROM ask_optout_events WHERE action = 'opt_out' GROUP BY user_id
       ) optout ON optout.user_id = u.id
       LEFT JOIN (
         SELECT from_user_id, COUNT(*) AS cnt FROM task_asks
         WHERE status = 'sent' AND created_at < NOW() - INTERVAL '${IGNORED_ASK_AFTER_HOURS} hours'
         GROUP BY from_user_id
       ) ignored ON ignored.from_user_id = u.id
       WHERE u.subscription_status = 'active'
     ) x
     WHERE sent_this_month < GREATEST(0, ${monthlyBudget} - fatigue_signals * ${FATIGUE_STEP_DOWN_PER_SIGNAL})`,
    [],
    SCORE_QUERY_TIMEOUT_MS,
  );
  return Number(result.rows[0]?.count ?? 0);
}

// T7 is a WEEKLY list — recomputing ~90 seconds of product-wide scoring on
// every read made two consecutive reads disagree whenever a per-word timeout
// skipped one topic under load (live-caught on the double-read check: one
// candidate dropped between reads 2 minutes apart). Inside the TTL every
// read returns the SAME built list by construction; expiry or a restart
// refreshes it. Config, not deploy.
const TARGET_LIST_CACHE_TTL_MS = Number(process.env.TARGET_LIST_CACHE_TTL_MINUTES ?? 60) * 60_000;
interface TargetListCache {
  sinceDays: number;
  builtAt: number;
  entries: TargetScoreEntry[];
}
let targetListCache: TargetListCache | null = null;

/** Test seam: the cache is module-level state and must not leak across tests. */
export function clearTargetListCache(): void {
  targetListCache = null;
}

/**
 * The ranked, explainable target list T7 asks for: every entry carries its
 * score parts (never a bare number), and the list's length is capacity-
 * driven — it grows and shrinks with countAskableUsers(), never a constant.
 */
export async function buildTargetList(sinceDays: number): Promise<TargetScoreEntry[]> {
  if (
    targetListCache !== null &&
    targetListCache.sinceDays === sinceDays &&
    Date.now() - targetListCache.builtAt < TARGET_LIST_CACHE_TTL_MS
  ) {
    return targetListCache.entries;
  }
  const entries = await buildTargetListUncached(sinceDays);
  targetListCache = { sinceDays, builtAt: Date.now(), entries };
  return entries;
}

// The founder's target rule (31 Aug, via Misho): Chorus invites only people
// the registration door would let in. The door's social proof asks for
// MIN_SUBSCRIBED_OWNERS subscribed holders (2 since the same ruling) — this
// mirrors that number and stays env-adjustable in lockstep with it.
const MIN_TARGET_SUBSCRIBED_HOLDERS = Number(
  process.env.CHORUS_MIN_SUBSCRIBED_HOLDERS ?? process.env.SOCIAL_PROOF_MIN_SUBSCRIBED_OWNERS ?? 2,
);
const SUBSCRIBED_STATUSES = ['active', 'trialing'];
// Same human-phonebook cap as the gate's social proof: a purchased 40k-row
// list must not vouch for a target here either.
const MAX_HUMAN_PHONEBOOK_ROWS = Number(process.env.SOCIAL_PROOF_MAX_OWNER_CONTACTS ?? 15000);

/**
 * How many active/trialing subscribers (human-sized phonebooks only) hold
 * each phone — the SAME predicate as the registration gate's social proof,
 * minus the spelling-variant fan-out: these phones come straight from
 * UserAlias rows, and the gate's variant matching can only find MORE owners,
 * so a target passing here is guaranteed to pass the door.
 */
async function subscribedHoldersForPhones(phones: string[]): Promise<Map<string, number>> {
  if (phones.length === 0) return new Map();
  const result = await query<{ phone: string; holders: string }>(
    `SELECT ua.phone, COUNT(DISTINCT ua."contactId") AS holders
     FROM "UserAlias" ua
     JOIN "User" u ON u.id = ua."contactId" AND u."deletedAt" IS NULL
       AND u.subscription_status = ANY($2)
     WHERE ua.phone = ANY($1)
       AND (SELECT COUNT(*) FROM "UserAlias" b
            WHERE b."contactId" = ua."contactId") <= $3
     GROUP BY ua.phone`,
    [phones, SUBSCRIBED_STATUSES, MAX_HUMAN_PHONEBOOK_ROWS],
    SCORE_QUERY_TIMEOUT_MS,
  );
  return new Map(result.rows.map((r) => [r.phone, Number(r.holders)]));
}

async function buildTargetListUncached(sinceDays: number): Promise<TargetScoreEntry[]> {
  const needs = await findUnmetNeeds(sinceDays);
  const candidates = gatherCandidates(needs);
  // Hard exclude #1 (Task 4 item 1): only Georgian personal mobiles can be
  // people — 0-800 lines, short codes and foreign-prefix normalisations out.
  const phones = Array.from(candidates.keys()).filter(isGeorgianPersonalMobile);

  const scoredCandidates = new Map(
    Array.from(candidates.entries()).filter(([phone]) => phones.includes(phone)),
  );
  const [reachMap, warmthMap, aliasMap, capacity, goalRelevant, bestVocabulary, holdersMap] =
    await Promise.all([
      reachForPhones(phones),
      warmthSignalsForPhones(phones),
      analyzeAliases(phones),
      countAskableUsers(),
      goalRelevantPhones(scoredCandidates),
      bestUserVocabulary(),
      subscribedHoldersForPhones(phones),
    ]);

  const entries: TargetScoreEntry[] = [];
  for (const phone of phones) {
    const ctx = candidates.get(phone) as CandidateContext;
    const reach = reachMap.get(phone) ?? 0;
    const analysis = aliasMap.get(phone);
    // Hard exclude #2: a brand word dominating the aliases at hotline reach
    // is a line, not a person (the tester's wissol/maksima/0-800 evidence).
    if (isHotline(analysis, reach)) continue;
    // Hard exclude #3 (the founder's target rule, 31 Aug via Misho): invite
    // ONLY people the registration door would let in — held by at least the
    // gate's own threshold of subscribers. An invited person who cannot
    // register is a wasted ask and a bad first impression.
    const subscribedHolders = holdersMap.get(phone) ?? 0;
    if (subscribedHolders < MIN_TARGET_SUBSCRIBED_HOLDERS) continue;
    const warmth = warmthScore(warmthMap.get(phone) ?? { strength: 0, colour: null, factCount: 0 });
    const needsNetai = hasNeedsNetaiSignal(ctx.label);
    const gapFilling = ctx.smallestPoolForItsTopics <= GAP_FILLING_POOL_THRESHOLD;
    const isGoalRelevant = goalRelevant.has(phone);
    const isBestUserLookalike = tokenize(ctx.label).some((t) => bestVocabulary.has(t));
    entries.push({
      phone,
      label: ctx.label,
      city: ctx.city,
      score: combinedScore({
        reach,
        pull: ctx.pull,
        warmth,
        needsNetai,
        gapFilling,
        goalRelevant: isGoalRelevant,
        bestUserLookalike: isBestUserLookalike,
      }),
      parts: {
        reach,
        pull: ctx.pull,
        warmth,
        needs_netai_signs: needsNetai,
        gap_filling_trade: gapFilling,
        goal_relevant: isGoalRelevant,
        best_user_lookalike: isBestUserLookalike,
        person_confirmed: analysis?.personConfirmed ?? false,
        subscribed_holders: subscribedHolders,
      },
    });
  }

  // Deterministic order (Task 4's "two reads a minute apart match"):
  // person-confirmed first, then score, then the phone string as the final
  // total tiebreak — no cluster of equal scores can shuffle the top-20 cut.
  entries.sort((a, b) => {
    if (a.parts.person_confirmed !== b.parts.person_confirmed) {
      return a.parts.person_confirmed ? -1 : 1;
    }
    if (b.score !== a.score) return b.score - a.score;
    return a.phone.localeCompare(b.phone);
  });
  return entries.slice(0, capacity);
}
