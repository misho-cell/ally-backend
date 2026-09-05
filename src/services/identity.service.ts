import { randomUUID } from 'crypto';
import { query } from '../db/postgres/client';
import { normalizePhone } from './phone';

const IDENTITY_QUERY_TIMEOUT_MS = 30_000;

// D35 shadow phase (approved 29 Aug): identity is a MAPPING over the raw
// data, never a rewrite. This module only builds the map:
//   - auto-merge: one registered account's own UserPhone numbers are the same
//     person BY DEFINITION (confidence 1.0) — the single case that needs no
//     human;
//   - everything else becomes an identity_candidates row for the admin queue
//     with its evidence, at a config-not-deploy threshold;
//   - approve/reject/unmerge are admin actions, each logged with the prior
//     state so unmerge restores exactly what was there.
// NO read path consumes person_identities yet — that is a later, separate
// deploy per read path (crowd-facts threshold first), by design.

// Config, not deploy: the candidate thresholds from the design document.
const MIN_CO_OWNERS = Number(process.env.IDENTITY_MIN_CO_OWNERS ?? 3);
const NAME_MATCH_CONFIDENCE = Number(process.env.IDENTITY_NAME_MATCH_CONFIDENCE ?? 0.8);
// A scan batch walks owner (contactId) ranges so the product-wide self-join
// stays bounded — the tier-backfill lesson (a migration-time full scan
// crash-looped the app) applied from day one.
const SCAN_BATCH_OWNERS = Number(process.env.IDENTITY_SCAN_BATCH_OWNERS ?? 2000);
const AUTO_MERGE_SOURCE = 'auto';

export interface IdentityScanResult {
  auto_merged_people: number;
  auto_merged_phones: number;
  candidates_added: number;
  owners_scanned: { from: number; to: number };
  done: boolean;
  next_from: number | null;
  /** Where to resume INSIDE the range; 0 once the range is drained. */
  next_pair_offset: number;
}

/**
 * Auto-merge: every registered, non-deleted account with 2+ own phone
 * numbers. Idempotent — a phone already mapped keeps its person_id.
 */
async function autoMergeRegisteredAccounts(): Promise<{ people: number; phones: number }> {
  const multi = await query<{ userId: number; phones: string[] }>(
    `SELECT up."userId", ARRAY_AGG(up.phone ORDER BY up.phone) AS phones
     FROM "UserPhone" up
     JOIN "User" u ON u.id = up."userId" AND u."deletedAt" IS NULL
     GROUP BY up."userId"
     HAVING COUNT(*) >= 2`,
    [],
    IDENTITY_QUERY_TIMEOUT_MS,
  );
  const accounts = multi.rows
    .map((row) => ({
      userId: row.userId,
      phones: Array.from(
        new Set(row.phones.map((p) => normalizePhone(p)).filter((p) => p !== '')),
      ).sort(),
    }))
    .filter((account) => account.phones.length >= 2);
  if (accounts.length === 0) return { people: 0, phones: 0 };

  // One read instead of one write per account. This runs on EVERY scan tick,
  // and in steady state all 392 multi-phone accounts are already merged — so
  // it was firing 392 no-op INSERTs a tick, which is most of what made a batch
  // outlive its 300s interval.
  const mappedRows = await query<{ phone: string; person_id: string }>(
    `SELECT phone, person_id FROM person_identities WHERE phone = ANY($1::text[])`,
    [Array.from(new Set(accounts.flatMap((account) => account.phones)))],
    IDENTITY_QUERY_TIMEOUT_MS,
  );
  const mapped = new Map(mappedRows.rows.map((r) => [r.phone, r.person_id]));

  let people = 0;
  let phones = 0;
  for (const row of accounts) {
    const normalized = row.phones;
    if (normalized.every((phone) => mapped.has(phone))) continue;
    // If one of this account's numbers already belongs to a person, the rest
    // JOIN that person. Minting a fresh id here would split one human across
    // two person_ids — the ON CONFLICT hides it, because the already-mapped
    // phone silently keeps the old id while its sibling gets the new one.
    const existing = normalized.map((phone) => mapped.get(phone)).find((id) => id !== undefined);
    const personId = existing ?? randomUUID();
    const inserted = await query<{ phone: string }>(
      `INSERT INTO person_identities (person_id, phone, confidence, evidence, merged_by)
       SELECT $1::uuid, p.phone, 1.0, $3::jsonb, $4
       FROM UNNEST($2::text[]) AS p(phone)
       ON CONFLICT (phone) DO NOTHING
       RETURNING phone`,
      [
        personId,
        normalized,
        JSON.stringify({ signal: 'registered_account_own_numbers', user_id: row.userId }),
        AUTO_MERGE_SOURCE,
      ],
      IDENTITY_QUERY_TIMEOUT_MS,
    );
    if (inserted.rows.length > 0) {
      people++;
      phones += inserted.rows.length;
      await query(
        `INSERT INTO person_merge_log (action, person_id, phones, prior_person_ids, evidence, actor)
         VALUES ('merge', $1::uuid, $2, '{}', $3::jsonb, $4)`,
        [
          personId,
          normalized,
          JSON.stringify({ signal: 'registered_account_own_numbers', user_id: row.userId }),
          AUTO_MERGE_SOURCE,
        ],
        IDENTITY_QUERY_TIMEOUT_MS,
      );
    }
  }
  return { people, phones };
}

/**
 * Candidate signal 2 (design doc): two phones that MIN_CO_OWNERS+ different
 * owners each saved under the SAME normalized alias — people are known by the
 * same name across phonebooks. Never auto-merged: queued for the admin with
 * the evidence.
 *
 * Two bounded steps (live-caught on the first scan: counting co-owners
 * INSIDE the owner range undercounts — three owners spread across three
 * batches would never reach the threshold): the range only DISCOVERS pairs
 * (one owner holding both phones under one normalized alias is enough to
 * discover), then each discovered pair's co-owner count runs GLOBALLY,
 * phone-indexed, so the threshold means what it says.
 */
// One page of pairs. 300 was a guess made when each pair cost its own query;
// measured on a live 500-owner range, 2,000 pairs cost the same 2.6s as 300
// (the group-by dominates, the pair count barely registers), so a page this
// size means a range drains in ~3 pages instead of ~17.
export const PAIR_CAP_PER_BATCH = Number(process.env.IDENTITY_PAIR_CAP_PER_BATCH ?? 2000);
// The scan's two heavy queries get their own, background-appropriate budget:
// at the shared 30s limit the discovery join over a dense owner-range blew
// "statement timeout" on every cron tick (31 Aug, six ticks in a row, zero
// progress) — and the old shell driver's advance-on-timeout was silently
// leaving such ranges partially scanned. A cron can afford to wait.
const SCAN_QUERY_TIMEOUT_MS = Number(process.env.IDENTITY_SCAN_QUERY_TIMEOUT_MS ?? 120_000);
// One name held by this many phones inside a SINGLE phonebook is not an
// identity signal, it is a role word — "მამა", "ტაქსი", "დირექტორი". Capping
// the group both removes that noise and stops one crowded name from
// generating thousands of pairs.
const MAX_PHONES_PER_NAME_GROUP = Number(process.env.IDENTITY_MAX_PHONES_PER_NAME ?? 20);

interface PairPageResult {
  added: number;
  /** A full page means this owner range still holds pairs we have not seen. */
  pageFull: boolean;
}

async function scanNameMatchCandidates(
  fromOwner: number,
  toOwner: number,
  pairOffset: number,
): Promise<PairPageResult> {
  // Group, don't self-join. The old query joined "UserAlias" to itself inside
  // each owner: one phonebook of 10,736 aliases (owner 1735, live) is ~115M
  // normalize() comparisons, and every cron tick from 31 Aug 09:37 to 1 Sep
  // 20:30 died on "canceling statement due to statement timeout" — 35 hours,
  // zero progress, because raising the app-side budget to 120s does not make
  // a quadratic join finish. Grouping by (owner, normalized alias) is one
  // pass over the covering index; the pairs are expanded from the group.
  const discovered = await query<{ phone_1: string; phone_2: string; sample_alias: string }>(
    `WITH name_groups AS (
       SELECT array_agg(DISTINCT a.phone) AS phones, MIN(a.alias) AS sample_alias
       FROM "UserAlias" a
       WHERE a."contactId" BETWEEN $1 AND $2
         AND LENGTH(TRIM(a.alias)) >= 3
       GROUP BY a."contactId", normalize_search_token(a.alias)
       HAVING COUNT(DISTINCT a.phone) BETWEEN 2 AND $4
     )
     SELECT x.p AS phone_1, y.p AS phone_2, g.sample_alias
     FROM name_groups g
     CROSS JOIN LATERAL unnest(g.phones) WITH ORDINALITY AS x(p, i)
     CROSS JOIN LATERAL unnest(g.phones) WITH ORDINALITY AS y(p, j)
     WHERE y.j > x.i
     ORDER BY x.p, y.p, g.sample_alias
     LIMIT $3 OFFSET $5`,
    [fromOwner, toOwner, PAIR_CAP_PER_BATCH, MAX_PHONES_PER_NAME_GROUP, pairOffset],
    SCAN_QUERY_TIMEOUT_MS,
  );
  const pageFull = discovered.rows.length === PAIR_CAP_PER_BATCH;
  if (discovered.rows.length === 0) return { added: 0, pageFull: false };

  // Every discovered pair's co-owner count in ONE query. It used to be one
  // query per pair — 300 sequential round trips per batch, which is why a
  // batch outlived the 300s tick interval even after discovery got fast.
  const counts = await query<{ phone_1: string; phone_2: string; co_owners: string }>(
    `SELECT p.phone_1, p.phone_2, COUNT(DISTINCT a."contactId") AS co_owners
     FROM unnest($1::text[], $2::text[]) AS p(phone_1, phone_2)
     JOIN "UserAlias" a ON a.phone = p.phone_1
     JOIN "UserAlias" b
       ON b."contactId" = a."contactId"
      AND b.phone = p.phone_2
      AND normalize_search_token(b.alias) = normalize_search_token(a.alias)
     GROUP BY p.phone_1, p.phone_2`,
    [discovered.rows.map((p) => p.phone_1), discovered.rows.map((p) => p.phone_2)],
    SCAN_QUERY_TIMEOUT_MS,
  );
  const coOwnerCount = new Map<string, number>(
    counts.rows.map((r) => [`${r.phone_1}\u0000${r.phone_2}`, Number(r.co_owners)]),
  );

  const passing = discovered.rows.filter(
    (pair) => (coOwnerCount.get(`${pair.phone_1}\u0000${pair.phone_2}`) ?? 0) >= MIN_CO_OWNERS,
  );
  const nameReach = await countPhonesPerName(passing.map((pair) => pair.sample_alias));

  let added = 0;
  for (const pair of passing) {
    const owners = coOwnerCount.get(`${pair.phone_1}\u0000${pair.phone_2}`) ?? 0;
    const phones = [pair.phone_1, pair.phone_2].sort();
    const inserted = await query<{ id: number }>(
      `INSERT INTO identity_candidates (phones, confidence, evidence)
       VALUES ($1, $2, $3::jsonb)
       ON CONFLICT (phones) DO NOTHING
       RETURNING id`,
      [
        phones,
        NAME_MATCH_CONFIDENCE,
        JSON.stringify({
          signal: 'same_normalized_alias_across_owners',
          co_owners: owners,
          sample_alias: pair.sample_alias,
          name_distinct_phones: nameReach.get(pair.sample_alias) ?? null,
        }),
      ],
      IDENTITY_QUERY_TIMEOUT_MS,
    );
    if (inserted.rows.length > 0) added++;
  }
  return { added, pageFull };
}

/**
 * How many DIFFERENT phones in the whole network carry each of these names.
 *
 * The review queue was ordered by co_owners alone, and the two numbers say
 * opposite things: co_owners counts how many people wrote the name down, this
 * counts how many people it could belong to. Live: "saba" sits on 3,270 phones
 * and "nino" on 4,687 — 79 owners agreeing on "Saba" is evidence of nothing,
 * while "თორნიკე აბულაძე" sits on 4 and three owners would be plenty. Without
 * this beside it, the strongest-LOOKING rows in the queue are the worst merges
 * a reviewer could make, and they sort to the top.
 */
async function countPhonesPerName(aliases: string[]): Promise<Map<string, number>> {
  const unique = Array.from(new Set(aliases.filter((alias) => alias.trim() !== '')));
  if (unique.length === 0) return new Map();
  // ONE pass over "UserAlias", whatever the name count. There is no btree on
  // normalize_search_token(alias), so every shape here pays for 8.4M function
  // calls once — the mistake to avoid is paying for them PER NAME. A LEFT JOIN
  // with the function in the ON clause did exactly that: 500 names timed out
  // past 180s, while this returns them together.
  const result = await query<{ alias: string; distinct_phones: string }>(
    `WITH names AS (
       SELECT DISTINCT w.alias, normalize_search_token(w.alias) AS norm
       FROM unnest($1::text[]) AS w(alias)
     ), reach AS (
       SELECT normalize_search_token(ua.alias) AS norm, COUNT(DISTINCT ua.phone) AS distinct_phones
       FROM "UserAlias" ua
       WHERE normalize_search_token(ua.alias) IN (SELECT norm FROM names)
       GROUP BY 1
     )
     SELECT n.alias, COALESCE(r.distinct_phones, 0) AS distinct_phones
     FROM names n LEFT JOIN reach r ON r.norm = n.norm`,
    [unique],
    SCAN_QUERY_TIMEOUT_MS,
  );
  return new Map(result.rows.map((r) => [r.alias, Number(r.distinct_phones)]));
}

/**
 * One shadow-scan batch: auto-merges the registered accounts' own numbers
 * (cheap, product-wide, idempotent) and walks one owner-range of the
 * name-match candidate scan. Returns where to resume so the whole base is
 * coverable in safe steps. Triggered by the admin route, or — since 31 Aug —
 * by the server's own tick (runIdentityScanTick below): the shell loop that
 * drove it externally died with its session container three times while the
 * writes themselves were always safe to resume.
 */
export async function runIdentityScan(
  fromOwner: number,
  pairOffset = 0,
): Promise<IdentityScanResult> {
  const auto = await autoMergeRegisteredAccounts();
  const maxOwner = await query<{ max: number | null }>(
    `SELECT MAX("contactId") AS max FROM "UserAlias"`,
    [],
    IDENTITY_QUERY_TIMEOUT_MS,
  );
  const last = maxOwner.rows[0]?.max ?? 0;
  const to = Math.min(fromOwner + SCAN_BATCH_OWNERS - 1, last);
  const page =
    fromOwner <= last
      ? await scanNameMatchCandidates(fromOwner, to, pairOffset)
      : { added: 0, pageFull: false };
  // A full page means this range still holds pairs: stay on it and move the
  // offset. Advancing here is what turned the scan into a sample — a live
  // 500-owner range holds 2,354-5,115 pairs and only 300 were ever read.
  const rangeDrained = !page.pageFull;
  const done = rangeDrained && to >= last;
  return {
    auto_merged_people: auto.people,
    auto_merged_phones: auto.phones,
    candidates_added: page.added,
    owners_scanned: { from: fromOwner, to },
    done,
    next_from: done ? null : rangeDrained ? to + 1 : fromOwner,
    next_pair_offset: rangeDrained ? 0 : pairOffset + PAIR_CAP_PER_BATCH,
  };
}

export interface IdentityScanTickResult {
  ran: boolean;
  done: boolean;
  next_from: number | null;
  candidates_added?: number;
}

/**
 * One self-driven step of the shadow scan, resumed from the server-held
 * progress row (migration 100). Skips instantly once done — the cron can
 * keep ticking forever at zero cost. Progress is written AFTER the batch,
 * so a crash mid-batch re-walks that batch (idempotent inserts make the
 * overlap harmless), never skips one.
 */
export async function runIdentityScanTick(): Promise<IdentityScanTickResult> {
  const progress = await query<{ next_from: number; done: boolean; pair_offset: number }>(
    `SELECT next_from, done, pair_offset FROM identity_scan_progress WHERE id = 1 LIMIT 1`,
    [],
    IDENTITY_QUERY_TIMEOUT_MS,
  );
  const row = progress.rows[0];
  if (!row || row.done) return { ran: false, done: row?.done ?? false, next_from: null };

  const result = await runIdentityScan(row.next_from, row.pair_offset);
  await query(
    `UPDATE identity_scan_progress
     SET next_from = COALESCE($1, next_from), done = $2, pair_offset = $3, updated_at = NOW()
     WHERE id = 1`,
    [result.next_from, result.done, result.next_pair_offset],
    IDENTITY_QUERY_TIMEOUT_MS,
  );
  return {
    ran: true,
    done: result.done,
    next_from: result.next_from,
    candidates_added: result.candidates_added,
  };
}

export interface IdentityCandidate {
  id: number;
  phones: string[];
  confidence: number;
  evidence: Record<string, unknown>;
  status: string;
  created_at: string;
}

/**
 * Stamp name_distinct_phones onto candidates queued before it was recorded.
 * Paced by `limit` and idempotent — rows that already carry the number are
 * skipped, so re-running it costs one query and finds nothing.
 */
export async function backfillCandidateNameReach(
  limit: number,
): Promise<{ checked: number; stamped: number; remaining: number }> {
  // One call does the lot. Paging made it worse, not safer: each page repeats
  // the same full pass over "UserAlias", so five pages cost five scans to do
  // what one scan answers.
  const pending = await query<{ id: number; sample_alias: string }>(
    `SELECT id, evidence->>'sample_alias' AS sample_alias
     FROM identity_candidates
     WHERE evidence->>'sample_alias' IS NOT NULL
       AND evidence->'name_distinct_phones' IS NULL
     ORDER BY id
     LIMIT $1`,
    [limit],
    IDENTITY_QUERY_TIMEOUT_MS,
  );
  if (pending.rows.length === 0) return { checked: 0, stamped: 0, remaining: 0 };

  const reach = await countPhonesPerName(pending.rows.map((r) => r.sample_alias));
  const stampable = pending.rows.filter((row) => reach.has(row.sample_alias));
  if (stampable.length > 0) {
    await query(
      `UPDATE identity_candidates c
       SET evidence = c.evidence || jsonb_build_object('name_distinct_phones', u.reach)
       FROM unnest($1::bigint[], $2::int[]) AS u(id, reach)
       WHERE c.id = u.id`,
      [stampable.map((row) => row.id), stampable.map((row) => reach.get(row.sample_alias) ?? 0)],
      SCAN_QUERY_TIMEOUT_MS,
    );
  }
  const left = await query<{ count: string }>(
    `SELECT COUNT(*) AS count FROM identity_candidates
     WHERE evidence->>'sample_alias' IS NOT NULL
       AND evidence->'name_distinct_phones' IS NULL`,
    [],
    IDENTITY_QUERY_TIMEOUT_MS,
  );
  return {
    checked: pending.rows.length,
    stamped: stampable.length,
    remaining: Number(left.rows[0]?.count ?? 0),
  };
}

/**
 * The review queue, in the order the founder actually reviews it (ticket 9
 * task 29, D97): rarest names first, one band at a time, paging past the first
 * 200, with the name and the evidence ON the row instead of buried in a JSON
 * blob — the screen showed „— → — 80%" for 2,316 rows because everything a
 * human needs was inside `evidence` and nothing lifted it out.
 */
export async function listIdentityCandidates(
  status: string,
  limit: number,
  opts: CandidateQuery = {},
): Promise<{ candidates: ReviewCandidate[]; total: number; matched: number }> {
  const rarity = `COALESCE((evidence->>'name_distinct_phones')::int, 0)`;
  const bandClause =
    opts.band === 'rare'
      ? ` AND ${rarity} <= ${RARE_MAX_PHONES}`
      : opts.band === 'uncommon'
        ? ` AND ${rarity} > ${RARE_MAX_PHONES} AND ${rarity} <= ${UNCOMMON_MAX_PHONES}`
        : opts.band === 'common'
          ? ` AND ${rarity} > ${UNCOMMON_MAX_PHONES}`
          : '';
  // Rarest first, and a rarity of 0 (never stamped) sorts with the rare names
  // rather than ahead of them.
  const order =
    opts.sort === 'rarity'
      ? `ORDER BY NULLIF(${rarity}, 0) ASC NULLS FIRST, id ASC`
      : `ORDER BY confidence DESC, id ASC`;
  const [page, total, matched] = await Promise.all([
    query<IdentityCandidate>(
      `SELECT id, phones, confidence, evidence, status, created_at
       FROM identity_candidates WHERE status = $1${bandClause}
       ${order} LIMIT $2 OFFSET $3`,
      [status, limit, opts.offset ?? 0],
      IDENTITY_QUERY_TIMEOUT_MS,
    ),
    query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM identity_candidates WHERE status = $1`,
      [status],
      IDENTITY_QUERY_TIMEOUT_MS,
    ),
    query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM identity_candidates WHERE status = $1${bandClause}`,
      [status],
      IDENTITY_QUERY_TIMEOUT_MS,
    ),
  ]);
  const rows = page.rows.map(toReviewCandidate);
  return {
    candidates: opts.namesOnly ? rows.filter((r) => r.looks_like_a_name) : rows,
    total: Number(total.rows[0]?.count ?? 0),
    matched: Number(matched.rows[0]?.count ?? 0),
  };
}

export interface IdentityTotals {
  by_status: Record<string, number>;
  by_band: Record<RarityBand, number>;
  /** Pending rows whose label is not a person's name at all. */
  not_a_name: number;
  bands: { rare: string; uncommon: string; common: string };
}

/**
 * The totals route (ticket 8 task 13.3, still 404 on 2 September): how many
 * pairs are waiting, in which band, and how many of them are placeholders
 * rather than names — the number that says how much of the queue is worth a
 * human's evening.
 */
export async function getIdentityTotals(): Promise<IdentityTotals> {
  const rarity = `COALESCE((evidence->>'name_distinct_phones')::int, 0)`;
  const [statuses, bands, pending] = await Promise.all([
    query<{ status: string; count: string }>(
      `SELECT status, COUNT(*) AS count FROM identity_candidates GROUP BY status`,
      [],
      IDENTITY_QUERY_TIMEOUT_MS,
    ),
    query<{ band: string; count: string }>(
      `SELECT CASE
                WHEN ${rarity} <= ${RARE_MAX_PHONES} THEN 'rare'
                WHEN ${rarity} <= ${UNCOMMON_MAX_PHONES} THEN 'uncommon'
                ELSE 'common' END AS band,
              COUNT(*) AS count
       FROM identity_candidates WHERE status = 'pending' GROUP BY band`,
      [],
      IDENTITY_QUERY_TIMEOUT_MS,
    ),
    query<{ sample_alias: string | null }>(
      `SELECT evidence->>'sample_alias' AS sample_alias
       FROM identity_candidates WHERE status = 'pending'`,
      [],
      IDENTITY_QUERY_TIMEOUT_MS,
    ),
  ]);
  const byBand: Record<RarityBand, number> = { rare: 0, uncommon: 0, common: 0 };
  for (const row of bands.rows) byBand[row.band as RarityBand] = Number(row.count);
  return {
    by_status: Object.fromEntries(statuses.rows.map((r) => [r.status, Number(r.count)])),
    by_band: byBand,
    not_a_name: pending.rows.filter((r) => !looksLikeAName(r.sample_alias)).length,
    bands: {
      rare: `the name is on at most ${RARE_MAX_PHONES} numbers in the whole base`,
      uncommon: `${RARE_MAX_PHONES + 1}–${UNCOMMON_MAX_PHONES} numbers`,
      common: `more than ${UNCOMMON_MAX_PHONES} numbers — these wait (D97)`,
    },
  };
}

/**
 * The rarity bands the founder reviews by (ticket 9 task 29, D97: "he reviews
 * the pairs himself, rare names first, nobody merges before his yes per pair,
 * common names wait").
 *
 * Rarity is `evidence.name_distinct_phones` — how many different numbers in
 * the whole base carry this name. Two numbers sharing „Levani Shalamberidze"
 * (9 numbers carry it) is weaker evidence than two sharing a name only they
 * have.
 */
export type RarityBand = 'rare' | 'uncommon' | 'common';
const RARE_MAX_PHONES = 2;
const UNCOMMON_MAX_PHONES = 5;

export function rarityBand(namePhones: number | null): RarityBand {
  if (namePhones === null || namePhones <= RARE_MAX_PHONES) return 'rare';
  if (namePhones <= UNCOMMON_MAX_PHONES) return 'uncommon';
  return 'common';
}

/**
 * Label shapes that are not a person's name, so the founder never reads them.
 *
 * The first 200 rare-band rows he was given are full of these: „Voice Recorder
 * (don't forget to merge calls)" on 30 candidates, „AT&T Service Contacts" on
 * 13, „Test Referral" with 168 co-owners, „Aaa Aaa", „Sg Sg", „Abo Abo". They
 * are rare precisely because nothing else in the base carries them, which is
 * how a placeholder floats to the top of a rarity sort.
 *
 * Never auto-rejected — nobody merges or discards anyone without his yes. They
 * are FLAGGED, and the export leaves them out by default while saying how many
 * it left out.
 */
const NON_NAME_MARKERS = [
  'voice recorder',
  'service contacts',
  'at&t',
  'test referral',
  'undefined',
  'no name',
  'unknown',
  'sim ',
  'sms',
  'voicemail',
  'ავტომოპასუხე',
  'ხმის ჩამწერი',
];

export function looksLikeAName(alias: string | null): boolean {
  const label = (alias ?? '').trim().toLowerCase();
  if (label.length < 3) return false;
  if (NON_NAME_MARKERS.some((m) => label.includes(m))) return false;
  const words = label.split(/\s+/).filter(Boolean);
  // „Aaa Aaa", „Sg Sg", „Abo Abo" — the same short token twice is a filler.
  if (words.length === 2 && words[0] === words[1] && words[0].length <= 4) return false;
  // A sentence is not a name: „Voice Recorder (don't forget to merge calls)".
  if (words.length > 5) return false;
  return true;
}

export interface ReviewCandidate extends IdentityCandidate {
  sample_alias: string | null;
  co_owners: number | null;
  name_distinct_phones: number | null;
  band: RarityBand;
  looks_like_a_name: boolean;
}

/** Lift the evidence a reviewer needs out of the JSON blob and onto the row. */
export function toReviewCandidate(row: IdentityCandidate): ReviewCandidate {
  const e = row.evidence ?? {};
  const alias = typeof e.sample_alias === 'string' ? e.sample_alias : null;
  const namePhones =
    typeof e.name_distinct_phones === 'number' ? (e.name_distinct_phones as number) : null;
  return {
    ...row,
    sample_alias: alias,
    co_owners: typeof e.co_owners === 'number' ? (e.co_owners as number) : null,
    name_distinct_phones: namePhones,
    band: rarityBand(namePhones),
    looks_like_a_name: looksLikeAName(alias),
  };
}

export interface CandidateQuery {
  status?: string;
  limit?: number;
  offset?: number;
  /** 'rarity' puts the rarest names first — the order he actually reviews in. */
  sort?: 'rarity' | 'confidence';
  band?: RarityBand;
  /** Leave out the placeholders that are not names at all. */
  namesOnly?: boolean;
}

export interface ScanProgressRow {
  next_from: number;
  done: boolean;
  pair_offset: number;
  updated_at: string;
}

export interface IdentitySummary {
  people: number;
  mapped_phones: number;
  candidates_pending: number;
  candidates_approved: number;
  candidates_rejected: number;
  merge_log_entries: number;
  /** The self-driven scan's position: null = migration 100 not applied yet. */
  scan: ScanProgressRow | null;
}

/** Ticket 8 task 13.3: the merged TOTALS, one read — the shadow map's size. */
export async function getIdentitySummary(): Promise<IdentitySummary> {
  const result = await query<{
    people: string;
    mapped_phones: string;
    candidates_pending: string;
    candidates_approved: string;
    candidates_rejected: string;
    merge_log_entries: string;
  }>(
    `SELECT
       (SELECT COUNT(DISTINCT person_id) FROM person_identities) AS people,
       (SELECT COUNT(*) FROM person_identities) AS mapped_phones,
       (SELECT COUNT(*) FROM identity_candidates WHERE status = 'pending') AS candidates_pending,
       (SELECT COUNT(*) FROM identity_candidates WHERE status = 'approved') AS candidates_approved,
       (SELECT COUNT(*) FROM identity_candidates WHERE status = 'rejected') AS candidates_rejected,
       (SELECT COUNT(*) FROM person_merge_log) AS merge_log_entries`,
    [],
    IDENTITY_QUERY_TIMEOUT_MS,
  );
  const row = result.rows[0];
  // pair_offset belongs in the summary: a frozen updated_at is how the 35-hour
  // stall was finally seen, and the offset says WHERE inside a range it froze.
  const scan = await query<ScanProgressRow>(
    `SELECT next_from, done, pair_offset, updated_at FROM identity_scan_progress WHERE id = 1 LIMIT 1`,
    [],
    IDENTITY_QUERY_TIMEOUT_MS,
  ).catch((err: unknown) => {
    // eslint-disable-next-line no-console
    console.error('[identity summary] progress row unreadable:', (err as Error).message);
    return { rows: [] as ScanProgressRow[] };
  });
  return {
    people: Number(row.people),
    mapped_phones: Number(row.mapped_phones),
    candidates_pending: Number(row.candidates_pending),
    candidates_approved: Number(row.candidates_approved),
    candidates_rejected: Number(row.candidates_rejected),
    merge_log_entries: Number(row.merge_log_entries),
    scan: scan.rows[0] ?? null,
  };
}

export interface DecisionOutcome {
  ok: boolean;
  person_id?: string;
  error?: string;
}

/**
 * The admin's yes on one candidate: the phones get one person_id (an already-
 * mapped phone keeps its map — approve never silently re-parents), the log
 * records the prior state, the candidate closes. Everything else in the
 * product still ignores person_identities (shadow).
 */
export async function approveIdentityCandidate(
  candidateId: number,
  actor: string,
): Promise<DecisionOutcome> {
  const candidate = await query<{ id: number; phones: string[]; evidence: unknown }>(
    `SELECT id, phones, evidence FROM identity_candidates
     WHERE id = $1 AND status = 'pending' LIMIT 1`,
    [candidateId],
    IDENTITY_QUERY_TIMEOUT_MS,
  );
  const row = candidate.rows[0];
  if (!row) return { ok: false, error: 'No pending candidate with that id.' };

  const prior = await query<{ phone: string; person_id: string }>(
    `SELECT phone, person_id FROM person_identities WHERE phone = ANY($1)`,
    [row.phones],
    IDENTITY_QUERY_TIMEOUT_MS,
  );
  // Reuse an existing person_id when one of the phones already belongs to a
  // person — the approval EXTENDS that person rather than inventing a rival.
  const personId = prior.rows[0]?.person_id ?? randomUUID();
  await query(
    `INSERT INTO person_identities (person_id, phone, confidence, evidence, merged_by)
     SELECT $1::uuid, p.phone, $3, $4::jsonb, $5
     FROM UNNEST($2::text[]) AS p(phone)
     ON CONFLICT (phone) DO NOTHING`,
    [personId, row.phones, NAME_MATCH_CONFIDENCE, JSON.stringify(row.evidence), actor],
    IDENTITY_QUERY_TIMEOUT_MS,
  );
  await query(
    `INSERT INTO person_merge_log (action, person_id, phones, prior_person_ids, evidence, actor)
     VALUES ('merge', $1::uuid, $2, $3, $4::jsonb, $5)`,
    [personId, row.phones, prior.rows.map((r) => r.person_id), JSON.stringify(row.evidence), actor],
    IDENTITY_QUERY_TIMEOUT_MS,
  );
  await query(
    `UPDATE identity_candidates SET status = 'approved', decided_by = $2, decided_at = NOW()
     WHERE id = $1`,
    [candidateId, actor],
    IDENTITY_QUERY_TIMEOUT_MS,
  );
  return { ok: true, person_id: personId };
}

export async function rejectIdentityCandidate(
  candidateId: number,
  actor: string,
): Promise<DecisionOutcome> {
  const updated = await query(
    `UPDATE identity_candidates SET status = 'rejected', decided_by = $2, decided_at = NOW()
     WHERE id = $1 AND status = 'pending'`,
    [candidateId, actor],
    IDENTITY_QUERY_TIMEOUT_MS,
  );
  if ((updated.rowCount ?? 0) === 0)
    return { ok: false, error: 'No pending candidate with that id.' };
  return { ok: true };
}

/**
 * Undo: remove a person's mapping rows and log the unmerge with what was
 * removed. The raw data was never touched, so nothing else needs restoring.
 */
export async function unmergePerson(personId: string, actor: string): Promise<DecisionOutcome> {
  const removed = await query<{ phone: string }>(
    `DELETE FROM person_identities WHERE person_id = $1::uuid RETURNING phone`,
    [personId],
    IDENTITY_QUERY_TIMEOUT_MS,
  );
  if (removed.rows.length === 0) return { ok: false, error: 'No such person_id.' };
  await query(
    `INSERT INTO person_merge_log (action, person_id, phones, prior_person_ids, actor)
     VALUES ('unmerge', $1::uuid, $2, ARRAY[$1::uuid], $3)`,
    [personId, removed.rows.map((r) => r.phone), actor],
    IDENTITY_QUERY_TIMEOUT_MS,
  );
  return { ok: true, person_id: personId };
}

export interface ExportRow {
  id: number;
  name_as_saved: string;
  people_who_saved_both: number | null;
  numbers_with_this_name: number | null;
  band: RarityBand;
  number_1: string;
  number_2: string;
  decision: '';
}

/**
 * The whole queue as the founder reviews it (ticket 9 task 29): a spreadsheet,
 * rarest first, one row per pair, with an empty Decision column he fills in.
 *
 * The numbers are shown as their last four digits, exactly as in the file he
 * already has — a review list is not a place to publish 4,632 phone numbers.
 * Placeholders („Voice Recorder…", „Test Referral", „Aaa Aaa") are left out by
 * default and counted, because a rarity sort floats them to the very top: they
 * are rare precisely because nothing else in the base carries them.
 */
export async function exportIdentityCandidates(
  namesOnly = true,
): Promise<{ rows: ExportRow[]; skipped_not_a_name: number; total_pending: number }> {
  const result = await query<IdentityCandidate>(
    `SELECT id, phones, confidence, evidence, status, created_at
     FROM identity_candidates WHERE status = 'pending'
     ORDER BY NULLIF(COALESCE((evidence->>'name_distinct_phones')::int, 0), 0) ASC NULLS FIRST,
              id ASC`,
    [],
    IDENTITY_QUERY_TIMEOUT_MS,
  );
  const all = result.rows.map(toReviewCandidate);
  const keep = namesOnly ? all.filter((r) => r.looks_like_a_name) : all;
  const last4 = (phone: string): string => `…${phone.slice(-4)}`;
  return {
    rows: keep.map((r) => ({
      id: r.id,
      name_as_saved: r.sample_alias ?? '',
      people_who_saved_both: r.co_owners,
      numbers_with_this_name: r.name_distinct_phones,
      band: r.band,
      number_1: last4(r.phones[0] ?? ''),
      number_2: last4(r.phones[1] ?? ''),
      decision: '',
    })),
    skipped_not_a_name: all.length - keep.length,
    total_pending: all.length,
  };
}

export interface BulkDecision {
  id: number;
  /** yes = the same person, no = different people. Anything else is left pending. */
  decision: string;
}

/**
 * His answers, loaded back (ticket 9 task 29). „yes" approves the pair, „no"
 * rejects it, and anything else — „unsure", blank — is deliberately left
 * pending: an unsure pair is not a decision and must not become one.
 *
 * Nobody merges anyone without a yes per pair (D97), so this is that yes,
 * applied through exactly the same approve/reject path as a single click.
 */
export async function applyIdentityDecisions(
  decisions: readonly BulkDecision[],
  actor: string,
): Promise<{ approved: number; rejected: number; skipped: number; errors: string[] }> {
  let approved = 0;
  let rejected = 0;
  let skipped = 0;
  const errors: string[] = [];
  for (const row of decisions) {
    const verdict = String(row.decision ?? '')
      .trim()
      .toLowerCase();
    const yes = ['yes', 'y', 'კი', 'დიახ', 'true', '1'].includes(verdict);
    const no = ['no', 'n', 'არა', 'false', '0'].includes(verdict);
    if (!yes && !no) {
      skipped += 1;
      continue;
    }
    const outcome = yes
      ? await approveIdentityCandidate(row.id, actor)
      : await rejectIdentityCandidate(row.id, actor);
    if (outcome.ok) {
      if (yes) approved += 1;
      else rejected += 1;
    } else {
      errors.push(`#${row.id}: ${outcome.error ?? 'failed'}`);
    }
  }
  return { approved, rejected, skipped, errors };
}
