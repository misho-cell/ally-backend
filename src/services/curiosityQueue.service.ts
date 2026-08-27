import { query } from '../db/postgres/client';
import { buildTargetList } from './targetScoring.service';
import { getTopConnectors } from './graphAnalytics.service';

const QUEUE_QUERY_TIMEOUT_MS = 8_000;

// T11: per-user ranked "who to be curious about next", five priority tiers
// per spec, in that order. Each candidate's own missing core fact
// (occupation/employer/city/industry — the same four-fact vocabulary
// save_contact_fact already uses) is what the question would fill; a
// candidate with all four already recorded has nothing left to be curious
// about and is dropped. "Answers write back as facts via T1" needs no new
// write path here — save_contact_fact already IS that path.

const CORE_FACT_TYPES = ['occupation', 'employer', 'city', 'industry'] as const;
type CoreFactType = (typeof CORE_FACT_TYPES)[number];

export type CuriosityQuestionType =
  | 'lookalike'
  | 'frequently_mentioned'
  | 'close_contact'
  | 'bridge_position'
  | 'warm_label_gap';

export interface CuriosityItem {
  phone: string;
  label: string | null;
  missing_fact: CoreFactType;
  question_type: CuriosityQuestionType;
  priority: number; // 1 (highest, per spec order) .. 5
}

// How many candidates any ONE tier contributes before dedup/fact-filtering —
// bounds every tier's own query cost regardless of phonebook size.
const TIER_CANDIDATE_LIMIT = 8;
const QUEUE_LIMIT_DEFAULT = 15;
const MIN_WORD_LENGTH = 3;

function significantWords(text: string): string[] {
  return Array.from(
    new Set(
      text
        .split(/\s+/)
        .map((w) => w.trim())
        .filter((w) => w.length >= MIN_WORD_LENGTH),
    ),
  );
}

interface TierCandidate {
  phone: string;
  questionType: CuriosityQuestionType;
  priority: number;
}

// Measured via EXPLAIN ANALYZE against the largest real phonebook (25,637
// contacts): one word's match costs ~570ms, dominated by the trigram bitmap
// scan over UserAlias.alias product-wide before it intersects down to this
// user's contactId. A short per-word timeout plus a small word cap keeps the
// worst real account's total tier-1 cost around a second, not the 8s x N
// this loop could otherwise reach.
const LOOKALIKE_WORD_LIMIT = 3;
const LOOKALIKE_QUERY_TIMEOUT_MS = 3_000;

/** Tier 1: MY contacts whose tag/alias resembles a word from T7's current target list. */
async function lookalikeCandidates(userId: string): Promise<TierCandidate[]> {
  const targets = await buildTargetList(30);
  const words = Array.from(new Set(targets.flatMap((t) => significantWords(t.label)))).slice(
    0,
    LOOKALIKE_WORD_LIMIT,
  );
  if (words.length === 0) return [];

  const found = new Map<string, TierCandidate>();
  for (const word of words) {
    if (found.size >= TIER_CANDIDATE_LIMIT) break;
    try {
      const result = await query<{ phone: string }>(
        `SELECT DISTINCT phone FROM (
           SELECT phone FROM "UserTags"
           WHERE "contactId" = $1 AND normalize_search_token(tag) % normalize_search_token($2)
           UNION
           SELECT phone FROM "UserAlias"
           WHERE "contactId" = $1 AND normalize_search_token(alias) % normalize_search_token($2)
         ) x LIMIT $3`,
        [userId, word, TIER_CANDIDATE_LIMIT],
        LOOKALIKE_QUERY_TIMEOUT_MS,
      );
      for (const row of result.rows) {
        if (!found.has(row.phone)) {
          found.set(row.phone, { phone: row.phone, questionType: 'lookalike', priority: 1 });
        }
      }
    } catch {
      // A slow word skips rather than stalling the whole queue — this tier
      // is a heuristic bonus, not a correctness-critical read.
    }
  }
  return Array.from(found.values());
}

// A phonebook this size (the largest in production: 25,637 rows) makes an
// unbounded per-contact fan-out into UserTags genuinely slow — live-caught
// via EXPLAIN ANALYZE against prod (261ms with the cap below; the
// ORDER BY id form this replaced didn't even finish inside the RO-SQL
// timeout, because ordering by id gave the planner no reason to use the
// contactId index and it swept UserAlias's own 8.4M rows backward instead).
// A capped, unordered sample trades exhaustiveness for a hard cost ceiling —
// correct for a heuristic "comes up a lot" tier, not for anything exact.
const MENTION_SAMPLE_SIZE = 500;

/** Tier 2: MY contacts with the most crowd tags — a proxy for "comes up a lot". */
async function frequentlyMentionedCandidates(userId: string): Promise<TierCandidate[]> {
  const result = await query<{ phone: string }>(
    `WITH mine_sample AS (
       SELECT phone FROM "UserAlias" WHERE "contactId" = $1 LIMIT $2
     )
     SELECT ms.phone
     FROM mine_sample ms
     JOIN "UserTags" t ON t.phone = ms.phone
     GROUP BY ms.phone
     HAVING COUNT(t.id) > 0
     ORDER BY COUNT(t.id) DESC
     LIMIT $3`,
    [userId, MENTION_SAMPLE_SIZE, TIER_CANDIDATE_LIMIT],
    QUEUE_QUERY_TIMEOUT_MS,
  );
  return result.rows.map((r) => ({
    phone: r.phone,
    questionType: 'frequently_mentioned',
    priority: 2,
  }));
}

/** Tier 3: MY contacts with the strongest machine-computed close relationship. */
async function closeContactCandidates(userId: string): Promise<TierCandidate[]> {
  const result = await query<{ contact_phone: string }>(
    `SELECT contact_phone FROM contact_relationship_scores
     WHERE user_id = $1::int AND relationship_type IN ('family', 'close')
     ORDER BY strength_score DESC LIMIT $2`,
    [userId, TIER_CANDIDATE_LIMIT],
    QUEUE_QUERY_TIMEOUT_MS,
  );
  return result.rows.map((r) => ({
    phone: r.contact_phone,
    questionType: 'close_contact',
    priority: 3,
  }));
}

/** Tier 4: MY contacts who bridge to the most people I don't already know (Neo4j). */
async function bridgePositionCandidates(userId: string): Promise<TierCandidate[]> {
  try {
    const outcome = await getTopConnectors(userId, TIER_CANDIDATE_LIMIT);
    if (!outcome.found || !outcome.results) return [];
    return outcome.results.map((r) => ({
      phone: r.phone,
      questionType: 'bridge_position',
      priority: 4,
    }));
  } catch {
    return [];
  }
}

/** Tier 5: MY warmest contacts with literally no fact recorded about them by anyone. */
async function warmLabelEmptyCandidates(userId: string): Promise<TierCandidate[]> {
  const result = await query<{ contact_phone: string }>(
    `SELECT crs.contact_phone FROM contact_relationship_scores crs
     WHERE crs.user_id = $1::int AND crs.relationship_type IN ('family', 'close')
       AND NOT EXISTS (
         SELECT 1 FROM contact_facts cf
         WHERE cf.neo4j_contact_id = crs.contact_phone AND cf.retracted_at IS NULL
       )
     ORDER BY crs.strength_score DESC LIMIT $2`,
    [userId, TIER_CANDIDATE_LIMIT],
    QUEUE_QUERY_TIMEOUT_MS,
  );
  return result.rows.map((r) => ({
    phone: r.contact_phone,
    questionType: 'warm_label_gap',
    priority: 5,
  }));
}

async function coreFactsPresence(phones: string[]): Promise<Map<string, Set<CoreFactType>>> {
  if (phones.length === 0) return new Map();
  const result = await query<{ phone: string; field_type: string }>(
    `SELECT DISTINCT neo4j_contact_id AS phone, field_type FROM contact_facts
     WHERE neo4j_contact_id = ANY($1) AND field_type = ANY($2) AND retracted_at IS NULL`,
    [phones, CORE_FACT_TYPES],
    QUEUE_QUERY_TIMEOUT_MS,
  );
  const map = new Map<string, Set<CoreFactType>>();
  for (const row of result.rows) {
    if (!map.has(row.phone)) map.set(row.phone, new Set());
    map.get(row.phone)?.add(row.field_type as CoreFactType);
  }
  return map;
}

function firstMissingCoreFact(present: Set<CoreFactType> | undefined): CoreFactType | null {
  for (const t of CORE_FACT_TYPES) {
    if (!present?.has(t)) return t;
  }
  return null;
}

async function labelsForPhones(
  userId: string,
  phones: string[],
): Promise<Map<string, string | null>> {
  if (phones.length === 0) return new Map();
  const result = await query<{ phone: string; label: string | null }>(
    `SELECT ua.phone, COALESCE(NULLIF(TRIM(u.name), ''), ua.alias) AS label
     FROM "UserAlias" ua
     LEFT JOIN "UserPhone" up ON up.phone = ua.phone
     LEFT JOIN "User" u ON u.id = up."userId"
     WHERE ua."contactId" = $1 AND ua.phone = ANY($2)`,
    [userId, phones],
    QUEUE_QUERY_TIMEOUT_MS,
  );
  return new Map(result.rows.map((r) => [r.phone, r.label]));
}

/**
 * The ranked queue itself: five tiers gathered in spec order, deduped
 * (a phone keeps its highest-priority tier only), then filtered to
 * candidates who actually have a missing core fact. Fully live-computed —
 * re-running this after an answer is saved naturally re-ranks the queue,
 * since the answered fact no longer counts as missing.
 */
export async function buildCuriosityQueue(
  userId: string,
  limit: number = QUEUE_LIMIT_DEFAULT,
): Promise<CuriosityItem[]> {
  const tierBuilders = [
    () => lookalikeCandidates(userId),
    () => frequentlyMentionedCandidates(userId),
    () => closeContactCandidates(userId),
    () => bridgePositionCandidates(userId),
    () => warmLabelEmptyCandidates(userId),
  ];

  const byPhone = new Map<string, TierCandidate>();
  for (const buildTier of tierBuilders) {
    for (const candidate of await buildTier()) {
      if (!byPhone.has(candidate.phone)) byPhone.set(candidate.phone, candidate);
    }
  }

  const phones = Array.from(byPhone.keys());
  const [presence, labels] = await Promise.all([
    coreFactsPresence(phones),
    labelsForPhones(userId, phones),
  ]);

  const items: CuriosityItem[] = [];
  for (const [phone, candidate] of byPhone) {
    const missing = firstMissingCoreFact(presence.get(phone));
    if (missing === null) continue;
    items.push({
      phone,
      label: labels.get(phone) ?? null,
      missing_fact: missing,
      question_type: candidate.questionType,
      priority: candidate.priority,
    });
  }
  items.sort((a, b) => a.priority - b.priority);
  const finalItems = items.slice(0, limit);

  // Fire-and-forget: T16's "curiosity_answer_rate" needs a record of what
  // was ever shown, but logging that must never slow down or break handing
  // the queue back to the model.
  void logSurfacedItems(userId, finalItems).catch((err: unknown) =>
    // eslint-disable-next-line no-console
    console.error('[curiosity-queue] surfacing log failed:', (err as Error).message),
  );

  return finalItems;
}

// T9 (ticket 7 task 13): the curiosity trigger's place in the ONE
// pending_updates list. At most one curiosity item enters the list, and only
// when nothing curiosity-shaped was surfaced within the interval — the same
// budget philosophy as the other triggers, env-configurable, never hardcoded.
const CURIOSITY_SURFACE_INTERVAL_DAYS = Number(process.env.CURIOSITY_SURFACE_INTERVAL_DAYS ?? 7);
// An account whose queue came back EMPTY is not re-computed on every
// conversation start — the five tiers are genuinely expensive. In-process
// negative cache: a restart retries once, which is honest and cheap.
const EMPTY_QUEUE_RETRY_MS = 24 * 60 * 60 * 1000;
const emptyQueueCheckedAt = new Map<string, number>();

export interface CuriosityUpdate {
  kind: 'curiosity';
  task_id: null;
  /**
   * Kept OUTSIDE payload: each surface addresses contacts its own way — the
   * in-app read merges the phone in, the connector swaps it for contact_ref.
   */
  phone: string;
  payload: Record<string, unknown>;
}

/**
 * The single curiosity item due for this user's conversation start, or null
 * when one was already surfaced within the interval (via this path OR the
 * get_curiosity_queue tool — curiosity_surfacing_log covers both) or the
 * queue is empty. buildCuriosityQueue logs the surfacing itself, which is
 * exactly what re-arms the interval.
 */
export async function maybeCuriosityUpdate(userId: string): Promise<CuriosityUpdate | null> {
  const lastEmptyCheck = emptyQueueCheckedAt.get(userId);
  if (lastEmptyCheck !== undefined && Date.now() - lastEmptyCheck < EMPTY_QUEUE_RETRY_MS) {
    return null;
  }
  const recent = await query<{ id: number }>(
    `SELECT id FROM curiosity_surfacing_log
     WHERE user_id = $1::int AND surfaced_at > NOW() - make_interval(days => $2)
     LIMIT 1`,
    [userId, CURIOSITY_SURFACE_INTERVAL_DAYS],
    QUEUE_QUERY_TIMEOUT_MS,
  );
  if (recent.rows.length > 0) return null;

  const items = await buildCuriosityQueue(userId, 1);
  if (items.length === 0) {
    emptyQueueCheckedAt.set(userId, Date.now());
    return null;
  }
  emptyQueueCheckedAt.delete(userId);
  const item = items[0];
  return {
    kind: 'curiosity',
    task_id: null,
    phone: item.phone,
    payload: {
      who: item.label,
      missing_fact: item.missing_fact,
      question_type: item.question_type,
      why: `their ${item.missing_fact} is not recorded and this person ranks first on the curiosity queue (${item.question_type})`,
      technique_tag: null,
      instruction:
        'If a natural moment comes up, ask ONE light question about this person — their ' +
        `${item.missing_fact}. Never interrogate, never force it into an unrelated conversation. ` +
        'Save the answer with save_contact_fact. Skipping it entirely is fine.',
    },
  };
}

async function logSurfacedItems(userId: string, items: CuriosityItem[]): Promise<void> {
  if (items.length === 0) return;
  await query(
    `INSERT INTO curiosity_surfacing_log (user_id, phone, question_type, missing_fact)
     SELECT * FROM UNNEST($1::int[], $2::text[], $3::text[], $4::text[])`,
    [
      items.map(() => Number(userId)),
      items.map((i) => i.phone),
      items.map((i) => i.question_type),
      items.map((i) => i.missing_fact),
    ],
    QUEUE_QUERY_TIMEOUT_MS,
  );
}
