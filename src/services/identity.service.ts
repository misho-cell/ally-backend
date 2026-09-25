import { randomUUID } from 'crypto';
import { query } from '../db/postgres/client';
import {
  TRADE_WORDS,
  THING_WORDS,
  PLACE_WORDS,
  ORGANISATION_WORDS,
  COMPANY_MARKERS,
  RELATIONSHIP_WORDS,
} from './labelDictionaries';
import { isShortDictionaryWord } from './labelReader.service';
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
    const reach = nameReach.get(pair.sample_alias) ?? null;
    const phones = [pair.phone_1, pair.phone_2].sort();
    const inserted = await query<{ id: number }>(
      `INSERT INTO identity_candidates (phones, confidence, evidence)
       VALUES ($1, $2, $3::jsonb)
       ON CONFLICT (phones) DO NOTHING
       RETURNING id`,
      [
        phones,
        pairConfidence(owners, reach),
        JSON.stringify({
          signal: 'same_normalized_alias_across_owners',
          co_owners: owners,
          sample_alias: pair.sample_alias,
          name_distinct_phones: reach,
        }),
      ],
      IDENTITY_QUERY_TIMEOUT_MS,
    );
    if (inserted.rows.length > 0) added++;
  }
  return { added, pageFull };
}

/**
 * Ticket 17 Task 91 (D172): the score, measured against the founder's own
 * answers rather than reasoned about.
 *
 * `co_owners` counts ACCOUNTS that saved BOTH numbers under the same
 * normalised name — the discovery query above joins phone_1 and phone_2 on one
 * `contactId` with one normalised alias. So the definition was never in doubt.
 *
 * What WAS wrong is what we did with it. Scored against the 160 pairs the
 * founder and Lika actually decided:
 *
 *   co_owners alone                AUC 0.378   ← worse than a coin flip
 *   co/(co + reach − 1)  (old)     AUC 0.679
 *   1/(reach − 1)        (this)    AUC 0.799
 *
 * Below 0.5 means MORE owners predicts TWO different people, not one. The
 * tester saw why before the numbers did: five unrelated rare names each showed
 * exactly 26 owners, and those are the same 26 accounts on all 23 such pairs —
 * one shared phonebook imported 26 times, counted as 26 people agreeing.
 * Median owners is 4 on the Yes pairs and 4 on the No pairs: it separates
 * nothing.
 *
 * Rarity is the whole signal, and it is the one the founder's answers agree
 * with — median reach 3 on Yes, 14 on No; of 78 Yes pairs, 55 sit on a name
 * carried by five numbers or fewer and NOT ONE on a name carried by more than
 * fifty. `1/(reach − 1)`: a name on exactly these two numbers scores 1.00, on
 * three numbers 0.50, on fifteen 0.07.
 *
 * `co_owners` stays on the row as evidence a human can weigh. It no longer
 * moves the number that orders Lika's queue.
 */
export function pairConfidence(coOwners: number, nameDistinctPhones: number | null): number {
  if (nameDistinctPhones === null) return NAME_MATCH_CONFIDENCE;
  const otherNumbers = Math.max(nameDistinctPhones - 1, 1);
  return Math.round((1 / otherNumbers) * 100) / 100;
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
  /**
   * Row 236 — the merged person, on an APPROVED row and nowhere else.
   *
   * `POST /admin/identity/unmerge` takes a `person_id` and there was no way to
   * learn one. The single-approve route returns it; the BULK route — which is
   * what the review page posts — threw it away and answered with counts, and
   * this listing never carried it at all. So an approved pair had no id
   * anywhere the screen could reach, and the undo button asked the reviewer to
   * type one.
   *
   * Absent on a pending or rejected row, because there is no merged person to
   * name — absent rather than null, so „not merged" and „merged, id unknown"
   * stay different answers.
   */
  person_id?: string;
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
): Promise<{
  candidates: ReviewCandidate[];
  total: number;
  matched: number;
  reviewable_total: number;
}> {
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
      : // Ticket 18 [91], the tester's second detail. The rarity score puts 787
        // rows at exactly 1.00 — every name carried by only these two numbers —
        // and inside that tie `id ASC` is arbitrary, so a pair with 21 owners
        // could sit above one with 3. The founder's own 200 answers separate
        // them: Yes median 4 owners, No median 21. Fewer owners first is the
        // same reading the score itself is built on — one shared phonebook
        // counted many times is the pattern that produced the 26-owner cards.
        // `id` stays last so two reads a minute apart still match.
        `ORDER BY confidence DESC,
                  COALESCE((evidence->>'co_owners')::int, 2147483647) ASC,
                  id ASC`;
  const [page, total, matched] = await Promise.all([
    query<IdentityCandidate>(
      /**
       * Row 236: the merged person's id rides along on an APPROVED row, so the
       * undo button has the value it needs instead of a field to type it into.
       *
       * Only for `approved`, and the CASE is why: the pending queue is the hot
       * read on this page and a correlated lookup per row would be paid on
       * every review, for rows that have no merged person to name.
       */
      `SELECT id, phones, confidence, evidence, status, created_at,
              CASE WHEN status = 'approved'
                   THEN (SELECT pi.person_id FROM person_identities pi
                          WHERE pi.phone = ANY(identity_candidates.phones) LIMIT 1)
              END AS person_id
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
    // Ticket 16 Task 87 leftover: the screen showed the pre-filter total.
    reviewable_total: await countReviewable(status),
  };
}

// The database-side estimate of the rule looksLikeAName applies per row:
// 2–5 words, no app/place marker, on at most MAX_PHONES_FOR_ONE_PERSON numbers.
async function countReviewable(status: string): Promise<number> {
  const markers = NON_NAME_MARKERS.map((m) => m.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  const result = await query<{ count: string }>(
    `SELECT COUNT(*) AS count FROM identity_candidates
     WHERE status = $1
       AND array_length(regexp_split_to_array(TRIM(evidence->>'sample_alias'), '\\s+'), 1) BETWEEN 2 AND 5
       AND COALESCE((evidence->>'name_distinct_phones')::int, 0) <= $2
       AND LOWER(evidence->>'sample_alias') !~ $3`,
    [status, MAX_PHONES_FOR_ONE_PERSON, `(${markers})`],
    IDENTITY_QUERY_TIMEOUT_MS,
  );
  return Number(result.rows[0]?.count ?? 0);
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
  'call recorder',
  'recorder',
  'merge calls',
  'taxi',
  'ტაქსი',
  'abano',
  'batumi',
  'tbilisi',
  'kutaisi',
  'rustavi',
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

// Ticket 16 Task 87 leftover: the founder's own junk rules for the target list
// (no trades, no companies, no places, no relationship words) apply to the
// review queue too — „Giorgi Restorani Agaraki", „Posta Niko", „joni bakuriani
// xelosnebi" are labels for a business or a place, not a person's name.
const JUNK_WORDS: readonly string[] = [
  ...TRADE_WORDS,
  ...THING_WORDS,
  ...PLACE_WORDS,
  ...ORGANISATION_WORDS,
  ...COMPANY_MARKERS,
  ...RELATIONSHIP_WORDS,
].map((w) => w.toLowerCase());
const JUNK_STEM_MIN_CHARS = 5;

function isJunkWord(token: string): boolean {
  // 21 September — the SHORT lists, asked first. They are four and five
  // characters, so `JUNK_STEM_MIN_CHARS` refuses them the stem rule and only
  // an exact spelling would have matched: „deda" yes, „dedis" no. The anchored
  // rule handles the case ending and refuses „Mamardashvili", which is why the
  // question is asked THERE and not copied here. A bare „deda" was already
  // rejected by the one-word rule below; „sabas babu dedis mxridan" was not.
  if (isShortDictionaryWord(token)) return true;
  return JUNK_WORDS.some(
    (w) => token === w || (w.length >= JUNK_STEM_MIN_CHARS && token.startsWith(w)),
  );
}

export function looksLikeAName(alias: string | null): boolean {
  const label = (alias ?? '').trim().toLowerCase();
  if (label.length < 3) return false;
  if (NON_NAME_MARKERS.some((m) => label.includes(m))) return false;
  const words = label.split(/\s+/).filter(Boolean);
  if (words.some((w) => isJunkWord(w.replace(/[.,()]/g, '')))) return false;
  // „Aaa Aaa", „Sg Sg", „Abo Abo" — the same short token twice is a filler.
  if (words.length === 2 && words[0] === words[1] && words[0].length <= 4) return false;
  // A sentence is not a name: „Voice Recorder (don't forget to merge calls)".
  if (words.length > 5) return false;
  // Ticket 14 Task 87: a single word is a first name alone („NINO", 4,687
  // numbers) or a place — the founder's own rule for the target list (no first
  // names alone) applies to the review queue too. A name with a hyphen or a
  // dot is a written-out person and stays.
  if (words.length === 1 && !/[-.]/.test(words[0])) return false;
  return true;
}

// A label carried by this many distinct numbers is a common first name or a
// placeholder, never „one person, two numbers" — the pair is not reviewable.
const MAX_PHONES_FOR_ONE_PERSON = 200;

export function reviewableCandidate(alias: string | null, namePhones: number | null): boolean {
  if (!looksLikeAName(alias)) return false;
  return namePhones === null || namePhones <= MAX_PHONES_FOR_ONE_PERSON;
}

export interface ReviewCandidate extends IdentityCandidate {
  sample_alias: string | null;
  /** The same name under the export's column name (Ticket 13 Task 82: the screen rendered a dash). */
  name_as_saved: string | null;
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
    // `...row` carries `person_id` through when the query supplied one, and
    // leaves the key absent when it did not — which is the distinction the
    // field's own comment asks for.
    ...row,
    sample_alias: alias,
    name_as_saved: alias,
    co_owners: typeof e.co_owners === 'number' ? (e.co_owners as number) : null,
    name_distinct_phones: namePhones,
    band: rarityBand(namePhones),
    looks_like_a_name: reviewableCandidate(alias, namePhones),
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
  /**
   * WHY IT FAILED, AS A WORD AND NOT AS A SENTENCE.
   *
   * The undo route used to choose its status code with
   * `outcome.error?.startsWith('No approved candidate')` — a route reading
   * prose, which breaks silently the day somebody improves the wording. It is
   * the same shape as a stale pointer: nothing complains, the reader is
   * calmly taken somewhere wrong.
   */
  reason?: 'not_found' | 'nothing_to_undo' | 'cannot_be_exact';
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
  if (!row) return { ok: false, reason: 'not_found', error: 'No pending candidate with that id.' };

  const prior = await query<{ phone: string; person_id: string }>(
    `SELECT phone, person_id FROM person_identities WHERE phone = ANY($1)`,
    [row.phones],
    IDENTITY_QUERY_TIMEOUT_MS,
  );
  // Reuse an existing person_id when one of the phones already belongs to a
  // person — the approval EXTENDS that person rather than inventing a rival.
  const personId = prior.rows[0]?.person_id ?? randomUUID();
  /**
   * `RETURNING phone` NAMES EXACTLY WHAT THIS APPROVAL CREATED, and that is
   * the whole of what an undo may remove. `ON CONFLICT (phone) DO NOTHING`
   * leaves a phone that already belonged to somebody exactly as it was, and
   * does not return it — so a phone this approval merely joined is not in the
   * list, and undoing will not unmap it.
   *
   * Row 236: without this, the only undo available deletes every phone of the
   * person, which is right for the 465 merges that created one and wrong for
   * the 7 that extended one.
   */
  const inserted = await query<{ phone: string }>(
    `INSERT INTO person_identities (person_id, phone, confidence, evidence, merged_by)
     SELECT $1::uuid, p.phone, $3, $4::jsonb, $5
     FROM UNNEST($2::text[]) AS p(phone)
     ON CONFLICT (phone) DO NOTHING
     RETURNING phone`,
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
    `UPDATE identity_candidates
        SET status = 'approved', decided_by = $2, decided_at = NOW(),
            person_id = $3::uuid, merged_phones = $4
      WHERE id = $1`,
    [candidateId, actor, personId, inserted.rows.map((r) => r.phone)],
    IDENTITY_QUERY_TIMEOUT_MS,
  );
  return { ok: true, person_id: personId };
}

/**
 * ROW 236 — UNDO THE PAIR, BY THE ONLY NAME THE SCREEN HAS.
 *
 * The Identity tab approves a CANDIDATE, so a candidate id is the only thing
 * it can offer back. Lika pressed undo and got „person_id required" with no
 * field to type one into; the route the code's own comment promised —
 * `POST /admin/identity/candidates/:id/unmerge` — had never been written.
 *
 * THIS REMOVES ONLY WHAT THE APPROVAL CREATED. `merged_phones` is the
 * `RETURNING phone` of that approval's insert, so a phone that already
 * belonged to somebody before the approval is not in it and is not touched.
 * `unmergePerson` cannot make that distinction: it takes the whole person,
 * which is right for a person the approval created and wrong for one it
 * extended.
 *
 * AND IT REFUSES WHERE IT CANNOT BE EXACT. Seven approvals extended an
 * existing person before this was recorded, and the merge log says which
 * person ids existed but not which phone carried which — so the set cannot be
 * recovered. Those return an error naming the other route rather than a guess.
 * Guessing here unmaps a real person's phone, and this whole table is still
 * shadow: nothing downstream reads it, so there is no urgency that could
 * justify being approximate.
 *
 * The candidate returns to `pending`, because that is what undo means to the
 * person pressing it — the pair goes back into the queue to be decided again.
 */
export async function unmergeCandidate(
  candidateId: number,
  actor: string,
): Promise<DecisionOutcome> {
  const found = await query<{ person_id: string | null; merged_phones: string[] | null }>(
    `SELECT person_id, merged_phones FROM identity_candidates
      WHERE id = $1 AND status = 'approved' LIMIT 1`,
    [candidateId],
    IDENTITY_QUERY_TIMEOUT_MS,
  );
  const row = found.rows[0];
  if (!row) return { ok: false, reason: 'not_found', error: 'No approved candidate with that id.' };
  if (!row.person_id || row.merged_phones === null) {
    return {
      ok: false,
      reason: 'cannot_be_exact',
      error:
        'This approval predates the record of which phones it added, and it extended a person ' +
        'that already existed — so an exact undo is not possible. Use POST /admin/identity/unmerge ' +
        'with the person id, which removes the whole person, after looking at what that person holds.',
    };
  }

  // An approval that inserted nothing — every phone already belonged to the
  // same person — is undone by putting the pair back in the queue. There is no
  // mapping to remove, and deleting one would be removing somebody else's.
  if (row.merged_phones.length > 0) {
    await query(
      `DELETE FROM person_identities WHERE person_id = $1::uuid AND phone = ANY($2)`,
      [row.person_id, row.merged_phones],
      IDENTITY_QUERY_TIMEOUT_MS,
    );
    await query(
      `INSERT INTO person_merge_log (action, person_id, phones, prior_person_ids, actor)
       VALUES ('unmerge', $1::uuid, $2, ARRAY[$1::uuid], $3)`,
      [row.person_id, row.merged_phones, actor],
      IDENTITY_QUERY_TIMEOUT_MS,
    );
  }

  await query(
    `UPDATE identity_candidates
        SET status = 'pending', decided_by = NULL, decided_at = NULL,
            person_id = NULL, merged_phones = NULL
      WHERE id = $1`,
    [candidateId],
    IDENTITY_QUERY_TIMEOUT_MS,
  );
  return { ok: true, person_id: row.person_id };
}

/**
 * ⚠️ ROW 236, SECOND HALF — THE UNDO BUTTON APPEARS AFTER A REJECT TOO, AND
 * THERE WAS NOTHING BEHIND IT.
 *
 * The founder, on /admin/identity at 12:53 on 25 September. He pressed
 * „უარყოფა" on candidate #232, the green bar offered „უკან წაღება", he pressed
 * it, and the red bar said **„No approved candidate with that id."** #232 is
 * still rejected. The undo after a REJECT was calling the undo for an
 * APPROVAL, and the approval path only ever looked at `status = 'approved'`.
 *
 * The screen has ONE undo button, so the server needs one undo. Which decision
 * is being taken back is a fact the server already holds; making the page
 * choose between two routes would be asking it to know something it has no
 * reason to know, which is exactly the mistake the first half of row 236 was
 * (`person_id required`, with nowhere to type one).
 *
 * A REJECTION CREATED NOTHING, so taking it back is one column. No phone
 * moves, no person is touched, and nothing goes in `person_merge_log` —
 * that log is for merges, and writing „unmerge" for a rejection would put a
 * row in it describing something that never happened.
 */
export async function undoCandidateDecision(
  candidateId: number,
  actor: string,
): Promise<DecisionOutcome> {
  const found = await query<{ status: string }>(
    `SELECT status FROM identity_candidates WHERE id = $1 LIMIT 1`,
    [candidateId],
    IDENTITY_QUERY_TIMEOUT_MS,
  );
  const status = found.rows[0]?.status;

  if (status === undefined) {
    return { ok: false, reason: 'not_found', error: 'No candidate with that id.' };
  }
  if (status === 'approved') return unmergeCandidate(candidateId, actor);
  if (status !== 'rejected') {
    // „Nothing to undo" and „no such candidate" are different facts, and the
    // 404 that used to cover both is how a working queue looks like a missing
    // row. The pair is in the queue; that IS the undone state.
    return {
      ok: false,
      reason: 'nothing_to_undo',
      error: `Candidate ${candidateId} is ${status} — there is no decision on it to take back.`,
    };
  }

  const reopened = await query(
    `UPDATE identity_candidates
        SET status = 'pending', decided_by = NULL, decided_at = NULL
      WHERE id = $1 AND status = 'rejected'`,
    [candidateId],
    IDENTITY_QUERY_TIMEOUT_MS,
  );
  if ((reopened.rowCount ?? 0) === 0) {
    // Somebody decided it between the read and the write. Never reported as
    // done: „I could not" and „I did" are the two this codebase keeps having
    // to keep apart.
    return {
      ok: false,
      reason: 'nothing_to_undo',
      error: `Candidate ${candidateId} was decided again while this was in flight — read it and try once more.`,
    };
  }
  return { ok: true };
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
    return { ok: false, reason: 'not_found', error: 'No pending candidate with that id.' };
  return { ok: true };
}

/**
 * REMOVE A WHOLE PERSON'S MAPPING. Not „undo one approval" — the docstring
 * used to say undo, and that word is why row 236 has a data-loss path hiding
 * behind it.
 *
 * This deletes EVERY phone mapped to that person id. When the approval created
 * the person that is the same thing as undoing it, and 465 of 472 merges did.
 * When the approval EXTENDED a person who already existed — 7 of them — this
 * also unmaps phones that approval never touched.
 *
 * For undoing one decision, use `unmergeCandidate`, which removes only what
 * that approval inserted. This stays because „take this person apart" is a
 * real thing to want; it is just not the undo button.
 *
 * The raw data was never touched, so nothing else needs restoring.
 */
export async function unmergePerson(
  personId: string,
  actor: string,
  wholePerson = false,
): Promise<DecisionOutcome> {
  /**
   * THE GUARD, ADDED 24 SEPTEMBER AFTER THE ROUTE BELOW WAS LEFT LIVE.
   *
   * `unmergeCandidate` now exists and undoes ONE approval exactly, and the
   * admin page is moving to it. Until it has, its undo button still calls this
   * — and on a person built from more than one approval, this takes all of
   * them. Documenting that and leaving it reachable is relying on somebody
   * else shipping promptly, which is not a guard.
   *
   * Measured rather than guessed: 466 people in the mapping, and SIX were
   * built from more than one approval (one from three). For those six, and
   * only those, pressing the old undo removes phones the approval never
   * touched.
   *
   * So the accident becomes impossible and the capability stays: taking a
   * whole person apart is a real thing to want, and it is now a deliberate
   * act rather than the default reading of a button labelled „undo".
   */
  if (!wholePerson) {
    const built = await query<{ merges: string }>(
      `SELECT COUNT(*) AS merges FROM person_merge_log
        WHERE action = 'merge' AND person_id = $1::uuid`,
      [personId],
      IDENTITY_QUERY_TIMEOUT_MS,
    );
    const merges = Number(built.rows[0]?.merges ?? 0);
    if (merges > 1) {
      return {
        ok: false,
        error:
          `This person was built from ${merges} separate approvals, so removing them ` +
          'removes more than any one decision did. To undo ONE approval use ' +
          'POST /admin/identity/candidates/:id/unmerge. To take the whole person ' +
          'apart on purpose, send whole_person: true.',
      };
    }
  }

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
  /** Plain words for the reviewer (Ticket 12 Task 62): what the flag means. */
  looks_like: string;
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
      looks_like: r.looks_like_a_name ? 'one person, two numbers' : 'not a person’s name',
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
): Promise<{
  approved: number;
  rejected: number;
  skipped: number;
  errors: string[];
  /**
   * Row 236 — WHICH person each approval produced, not just how many there
   * were.
   *
   * `approveIdentityCandidate` returns the `person_id` and this function threw
   * it away, answering with three counts. `POST /admin/identity/unmerge` takes
   * exactly that id, so a pair approved through this route — which is the one
   * the review page posts to — could never be undone from the screen, whatever
   * the button did. The red error asking the reviewer for a person id was the
   * frontend having nothing to send.
   *
   * The counts stay: they are the summary the screen shows. This is beside
   * them, not instead of them.
   */
  merged: { id: number; person_id: string }[];
}> {
  let approved = 0;
  let rejected = 0;
  let skipped = 0;
  const errors: string[] = [];
  const merged: { id: number; person_id: string }[] = [];
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
      if (yes) {
        approved += 1;
        if (outcome.person_id) merged.push({ id: row.id, person_id: outcome.person_id });
      } else rejected += 1;
    } else {
      errors.push(`#${row.id}: ${outcome.error ?? 'failed'}`);
    }
  }
  return { approved, rejected, skipped, errors, merged };
}
