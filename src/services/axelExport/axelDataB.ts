import { query } from '../../db/postgres/client';
import type { OwnerContactValue } from './axelData';

/**
 * The second delivery's reads (parts B, C, E). Batched like axelData.ts: one
 * statement per table over all owners or all contact numbers, phones compared
 * by digits.
 */
const READ_TIMEOUT_MS = 90_000;
const DIGITS = (col: string): string => `regexp_replace(${col}, '\\D', '', 'g')`;

export interface FactRow {
  readonly contact_digits: string;
  readonly field_type: string;
  readonly value: string;
  readonly is_public: boolean;
  readonly source: string | null;
  readonly confidence: string | null;
  readonly submitted_by: string | null;
  readonly created_at: Date | null;
}

/** Every unretracted fact on these numbers, from anyone. */
export async function readFacts(digits: readonly string[]): Promise<FactRow[]> {
  const result = await query<FactRow>(
    `SELECT ${DIGITS('neo4j_contact_id')} AS contact_digits, field_type,
            COALESCE(canonical_value, value) AS value, is_public, source, confidence,
            submitted_by_user_id::text AS submitted_by, created_at
       FROM contact_facts
      WHERE retracted_at IS NULL AND ${DIGITS('neo4j_contact_id')} = ANY($1::text[])`,
    [digits],
    READ_TIMEOUT_MS,
  );
  return result.rows;
}

/** What each owner's assistant saved about each contact (contact_insights.data). */
export async function readInsights(ownerIds: readonly number[]): Promise<OwnerContactValue[]> {
  // user_id is declared a UUID in the old migration and holds integer ids in
  // practice (getContactFullProfile.ts), so it is compared and read as text.
  const result = await query<{ owner: string; contact_digits: string; value: string }>(
    `SELECT user_id::text AS owner, ${DIGITS('neo4j_contact_id')} AS contact_digits,
            data::text AS value
       FROM contact_insights
      WHERE user_id::text = ANY($1::text[])`,
    [ownerIds.map(String)],
    READ_TIMEOUT_MS,
  );
  return result.rows.map((r) => ({ ...r, owner_id: Number(r.owner) }));
}

async function ownerRows(sql: string, ownerIds: readonly number[]): Promise<OwnerContactValue[]> {
  const result = await query<OwnerContactValue>(sql, [ownerIds], READ_TIMEOUT_MS);
  return result.rows;
}

export const readExclusions = (ids: readonly number[]): Promise<OwnerContactValue[]> =>
  ownerRows(
    `SELECT user_id AS owner_id, ${DIGITS('contact_phone')} AS contact_digits,
            COALESCE(excluded_for, '') || '|' || COALESCE(reason, '') AS value
       FROM contact_exclusions WHERE user_id = ANY($1::int[])`,
    ids,
  );

export const readBlocks = (ids: readonly number[]): Promise<OwnerContactValue[]> =>
  ownerRows(
    `SELECT "blockerId" AS owner_id, ${DIGITS('"blockedPhone"')} AS contact_digits,
            'blocked' AS value
       FROM "UserBlock" WHERE "blockerId" = ANY($1::int[])`,
    ids,
  );

export const readWarmthEvents = (ids: readonly number[]): Promise<OwnerContactValue[]> =>
  ownerRows(
    `SELECT user_id AS owner_id, ${DIGITS('contact_phone')} AS contact_digits, kind AS value
       FROM warmth_events WHERE user_id = ANY($1::int[])`,
    ids,
  );

export const readIntroductions = (ids: readonly number[]): Promise<OwnerContactValue[]> =>
  ownerRows(
    `SELECT requester_user_id AS owner_id, ${DIGITS('target_phone')} AS contact_digits,
            status AS value
       FROM introduction_requests
      WHERE requester_user_id = ANY($1::int[]) AND target_phone IS NOT NULL`,
    ids,
  );

export const readInvites = (ids: readonly number[]): Promise<OwnerContactValue[]> =>
  ownerRows(
    `SELECT user_id AS owner_id, ${DIGITS('contact_phone')} AS contact_digits, 'invited' AS value
       FROM invites WHERE user_id = ANY($1::int[])`,
    ids,
  );

/** Ties the owner wrote down between two of their contacts. */
export const readOwnerTies = (ids: readonly number[]): Promise<OwnerContactValue[]> =>
  ownerRows(
    `SELECT user_id AS owner_id, ${DIGITS('phone_a')} AS contact_digits,
            relation || '|' || ${DIGITS('phone_b')} AS value
       FROM contact_relationships WHERE user_id = ANY($1::int[])
     UNION ALL
     SELECT user_id, ${DIGITS('phone_b')}, relation || '|' || ${DIGITS('phone_a')}
       FROM contact_relationships WHERE user_id = ANY($1::int[])`,
    ids,
  );

export interface AskRow {
  readonly owner_id: number;
  readonly to_user_id: number;
  readonly status: string;
  readonly declined: boolean;
  readonly later: boolean;
}

/** Asks each owner sent, to whom and how they ended. */
export async function readOwnerAsks(ids: readonly number[]): Promise<AskRow[]> {
  const result = await query<AskRow>(
    `SELECT from_user_id AS owner_id, to_user_id, status,
            declined_at IS NOT NULL AS declined, later_at IS NOT NULL AS later
       FROM task_asks WHERE from_user_id = ANY($1::int[]) AND parent_ask_id IS NULL`,
    [ids],
    READ_TIMEOUT_MS,
  );
  return result.rows;
}

export interface EnrichmentRow {
  readonly contact_digits: string;
  readonly industry: string | null;
  readonly seniority: string | null;
  readonly is_decision_maker: boolean | null;
}

export async function readEnrichment(
  digits: readonly string[],
): Promise<Map<string, EnrichmentRow>> {
  const result = await query<EnrichmentRow>(
    `SELECT ${DIGITS('phone')} AS contact_digits, industry, seniority, is_decision_maker
       FROM contact_enrichment WHERE ${DIGITS('phone')} = ANY($1::text[])`,
    [digits],
    READ_TIMEOUT_MS,
  );
  return new Map(result.rows.map((r) => [r.contact_digits, r]));
}

export interface MemberOtherRow {
  readonly id: number;
  readonly conversations: number;
  readonly messages_written: number;
  readonly goals_open: number;
  readonly goals_paused: number;
  readonly goals_closed: number;
  readonly asks_received_answered: number;
  readonly asks_received_declined: number;
  readonly asks_received_open: number;
  readonly introductions_requested: number;
  readonly introductions_mediated: number;
  readonly invites_sent: number;
  readonly answer_rules: number;
  readonly chorus_asked: number;
  readonly chorus_agreed: number;
  readonly referral_earnings: number;
  readonly referral_earned_usd: string;
}

/** Part E: everything else per member, as counts and dates — never the text. */
export async function readMemberOther(ids: readonly number[]): Promise<MemberOtherRow[]> {
  const result = await query<MemberOtherRow>(
    `SELECT u.id,
       (SELECT COUNT(*) FROM threads t WHERE t.user_id = u.id)::int AS conversations,
       (SELECT COUNT(*) FROM conversations c WHERE c.user_id = u.id AND c.role = 'user')::int
         AS messages_written,
       (SELECT COUNT(*) FROM tasks t WHERE t.user_id = u.id::text AND t.status = 'open')::int AS goals_open,
       (SELECT COUNT(*) FROM tasks t WHERE t.user_id = u.id::text AND t.status = 'paused')::int AS goals_paused,
       (SELECT COUNT(*) FROM tasks t WHERE t.user_id = u.id::text AND t.status = 'closed')::int AS goals_closed,
       (SELECT COUNT(*) FROM task_asks a WHERE a.to_user_id = u.id AND a.status = 'answered'
          AND a.declined_at IS NULL)::int AS asks_received_answered,
       (SELECT COUNT(*) FROM task_asks a WHERE a.to_user_id = u.id AND a.declined_at IS NOT NULL)::int
         AS asks_received_declined,
       (SELECT COUNT(*) FROM task_asks a WHERE a.to_user_id = u.id AND a.status = 'sent')::int
         AS asks_received_open,
       (SELECT COUNT(*) FROM introduction_requests r WHERE r.requester_user_id = u.id)::int
         AS introductions_requested,
       (SELECT COUNT(*) FROM introduction_requests r WHERE r.mediator_user_id = u.id)::int
         AS introductions_mediated,
       (SELECT COUNT(*) FROM invites i WHERE i.user_id = u.id)::int AS invites_sent,
       (SELECT COUNT(*) FROM answer_rules ar WHERE ar.user_id = u.id)::int AS answer_rules,
       (SELECT COUNT(*) FROM invite_campaign_participants p WHERE p.inviter_user_id = u.id
          AND p.state <> 'pending')::int AS chorus_asked,
       (SELECT COUNT(*) FROM invite_campaign_participants p WHERE p.inviter_user_id = u.id
          AND p.state IN ('agreed', 'told', 'joined'))::int AS chorus_agreed,
       (SELECT COUNT(*) FROM referral_transactions rt WHERE rt.user_id = u.id::text
          AND rt.reason = 'earn')::int AS referral_earnings,
       COALESCE((SELECT SUM(rt.amount_usd) FROM referral_transactions rt
          WHERE rt.user_id = u.id::text AND rt.reason = 'earn'), 0)::text AS referral_earned_usd
     FROM "User" u WHERE u.id = ANY($1::int[])`,
    [ids],
    READ_TIMEOUT_MS,
  );
  return result.rows;
}
