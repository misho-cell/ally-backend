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
  let people = 0;
  let phones = 0;
  for (const row of multi.rows) {
    const normalized = Array.from(
      new Set(row.phones.map((p) => normalizePhone(p)).filter((p) => p !== '')),
    ).sort();
    if (normalized.length < 2) continue;
    const personId = randomUUID();
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
const PAIR_CAP_PER_BATCH = Number(process.env.IDENTITY_PAIR_CAP_PER_BATCH ?? 300);

async function scanNameMatchCandidates(fromOwner: number, toOwner: number): Promise<number> {
  const discovered = await query<{ phone_1: string; phone_2: string; sample_alias: string }>(
    `SELECT a.phone AS phone_1, b.phone AS phone_2, MIN(a.alias) AS sample_alias
     FROM "UserAlias" a
     JOIN "UserAlias" b
       ON b."contactId" = a."contactId"
      AND b.phone > a.phone
      AND normalize_search_token(b.alias) = normalize_search_token(a.alias)
     WHERE a."contactId" BETWEEN $1 AND $2
       AND LENGTH(TRIM(a.alias)) >= 3
     GROUP BY a.phone, b.phone
     LIMIT $3`,
    [fromOwner, toOwner, PAIR_CAP_PER_BATCH],
    IDENTITY_QUERY_TIMEOUT_MS,
  );
  let added = 0;
  for (const pair of discovered.rows) {
    const coOwners = await query<{ co_owners: string }>(
      `SELECT COUNT(DISTINCT a."contactId") AS co_owners
       FROM "UserAlias" a
       JOIN "UserAlias" b
         ON b."contactId" = a."contactId"
        AND b.phone = $2
        AND normalize_search_token(b.alias) = normalize_search_token(a.alias)
       WHERE a.phone = $1`,
      [pair.phone_1, pair.phone_2],
      IDENTITY_QUERY_TIMEOUT_MS,
    );
    const owners = Number(coOwners.rows[0]?.co_owners ?? 0);
    if (owners < MIN_CO_OWNERS) continue;
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
        }),
      ],
      IDENTITY_QUERY_TIMEOUT_MS,
    );
    if (inserted.rows.length > 0) added++;
  }
  return added;
}

/**
 * One shadow-scan batch, admin-triggered (never a cron): auto-merges the
 * registered accounts' own numbers (cheap, product-wide, idempotent) and
 * walks one owner-range of the name-match candidate scan. Returns where to
 * resume so the whole base is coverable in safe steps.
 */
export async function runIdentityScan(fromOwner: number): Promise<IdentityScanResult> {
  const auto = await autoMergeRegisteredAccounts();
  const maxOwner = await query<{ max: number | null }>(
    `SELECT MAX("contactId") AS max FROM "UserAlias"`,
    [],
    IDENTITY_QUERY_TIMEOUT_MS,
  );
  const last = maxOwner.rows[0]?.max ?? 0;
  const to = Math.min(fromOwner + SCAN_BATCH_OWNERS - 1, last);
  const candidates = fromOwner <= last ? await scanNameMatchCandidates(fromOwner, to) : 0;
  const done = to >= last;
  return {
    auto_merged_people: auto.people,
    auto_merged_phones: auto.phones,
    candidates_added: candidates,
    owners_scanned: { from: fromOwner, to },
    done,
    next_from: done ? null : to + 1,
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

export async function listIdentityCandidates(
  status: string,
  limit: number,
): Promise<{ candidates: IdentityCandidate[]; total: number }> {
  const [page, total] = await Promise.all([
    query<IdentityCandidate>(
      `SELECT id, phones, confidence, evidence, status, created_at
       FROM identity_candidates WHERE status = $1
       ORDER BY confidence DESC, id ASC LIMIT $2`,
      [status, limit],
      IDENTITY_QUERY_TIMEOUT_MS,
    ),
    query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM identity_candidates WHERE status = $1`,
      [status],
      IDENTITY_QUERY_TIMEOUT_MS,
    ),
  ]);
  return { candidates: page.rows, total: Number(total.rows[0]?.count ?? 0) };
}

export interface IdentitySummary {
  people: number;
  mapped_phones: number;
  candidates_pending: number;
  candidates_approved: number;
  candidates_rejected: number;
  merge_log_entries: number;
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
  return {
    people: Number(row.people),
    mapped_phones: Number(row.mapped_phones),
    candidates_pending: Number(row.candidates_pending),
    candidates_approved: Number(row.candidates_approved),
    candidates_rejected: Number(row.candidates_rejected),
    merge_log_entries: Number(row.merge_log_entries),
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
