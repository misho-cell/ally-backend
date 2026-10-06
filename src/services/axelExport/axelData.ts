import { query } from '../../db/postgres/client';
import { joinedNetai } from '../netaiMembership';
import { rosterMembers, type RosterMember } from '../roster.service';

/**
 * The Axel export's reads (Misho's direct word, 6 Oct; the founder's request
 * of 11:22). Every read is batched over the whole roster — one statement per
 * table, never one per member — and every phone is compared by its digits,
 * because the tables spell numbers differently (+995…, 995…, 0…).
 *
 * The phonebook is "UserAlias", and its OWNER is "contactId" (the column name
 * is the old app's; "userId" is never read). The contact is only a phone.
 */
export const AXEL_GROUP = 'Axel';
const READ_TIMEOUT_MS = 60_000;
/** migration 068 stamped every older row with this instant; it is not when a label was saved. */
export const ALIAS_BACKFILL_AT = '2026-08-22T11:40:18.341860Z';

const DIGITS = (col: string): string => `regexp_replace(${col}, '\\D', '', 'g')`;

export interface AccountRow {
  readonly id: number;
  readonly created_at: Date | null;
  readonly deleted_at: Date | null;
  readonly subscription_status: string | null;
  readonly job_position: string | null;
  readonly employer: string | null;
  readonly city: string | null;
  readonly netai_user: boolean;
  readonly last_active: Date | null;
}

export async function readAccounts(userIds: readonly number[]): Promise<Map<number, AccountRow>> {
  const result = await query<AccountRow>(
    `SELECT u.id, u."createdAt" AS created_at, u."deletedAt" AS deleted_at,
            u.subscription_status, u."jobPosition" AS job_position, u.employer, u.city,
            ${joinedNetai('u')} AS netai_user,
            (SELECT MAX(c.created_at) FROM conversations c WHERE c.user_id = u.id) AS last_active
       FROM "User" u WHERE u.id = ANY($1::int[])`,
    [userIds],
    READ_TIMEOUT_MS,
  );
  return new Map(result.rows.map((r) => [r.id, r]));
}

export interface PhonebookRow {
  readonly owner_id: number;
  readonly contact_digits: string;
  readonly label: string | null;
  readonly saved_at: Date | null;
  readonly source: string | null;
}

export async function readPhonebooks(ownerIds: readonly number[]): Promise<PhonebookRow[]> {
  const result = await query<PhonebookRow>(
    `SELECT "contactId" AS owner_id, ${DIGITS('phone')} AS contact_digits, alias AS label,
            created_at AS saved_at, source
       FROM "UserAlias"
      WHERE "contactId" = ANY($1::int[]) AND phone IS NOT NULL AND ${DIGITS('phone')} <> ''`,
    [ownerIds],
    READ_TIMEOUT_MS,
  );
  return result.rows;
}

export interface OwnerContactValue {
  readonly owner_id: number;
  readonly contact_digits: string;
  readonly value: string;
}

/** One (owner, contact, value) per row of a per-owner table keyed by a phone column. */
async function readOwnerValues(
  table: string,
  ownerCol: string,
  phoneCol: string,
  valueSql: string,
  ownerIds: readonly number[],
): Promise<OwnerContactValue[]> {
  const result = await query<OwnerContactValue>(
    `SELECT ${ownerCol} AS owner_id, ${DIGITS(phoneCol)} AS contact_digits, ${valueSql} AS value
       FROM ${table} WHERE ${ownerCol} = ANY($1::int[])`,
    [ownerIds],
    READ_TIMEOUT_MS,
  );
  return result.rows;
}

export const readTags = (ids: readonly number[]): Promise<OwnerContactValue[]> =>
  readOwnerValues(
    '"UserTags"',
    '"contactId"',
    'phone',
    `tag || '|' || COALESCE(source::text, '')`,
    ids,
  );
export const readScores = (ids: readonly number[]): Promise<OwnerContactValue[]> =>
  readOwnerValues(
    'contact_relationship_scores',
    'user_id',
    'contact_phone',
    `relationship_type || '|' || COALESCE(strength_score::text, '')`,
    ids,
  );
export const readTiers = (ids: readonly number[]): Promise<OwnerContactValue[]> =>
  readOwnerValues('human_relationship_tiers', 'user_id', 'contact_phone', 'tier', ids);
export const readStatedClose = (ids: readonly number[]): Promise<OwnerContactValue[]> =>
  readOwnerValues(
    `(SELECT * FROM warmth_events WHERE kind = 'stated_close') w`,
    'user_id',
    'contact_phone',
    'kind',
    ids,
  );

/** The old Ally phonebook: the colour each owner gave each contact. */
export async function readLegacyColours(ownerIds: readonly number[]): Promise<OwnerContactValue[]> {
  const result = await query<OwnerContactValue>(
    `SELECT uc."originUserId" AS owner_id, ${DIGITS('ucp.phone')} AS contact_digits,
            COALESCE(uc."relationshipStatus"::text, '') AS value
       FROM "UserConnection" uc JOIN "UserConnectionPhone" ucp ON ucp."connectionId" = uc.id
      WHERE uc."originUserId" = ANY($1::int[])`,
    [ownerIds],
    READ_TIMEOUT_MS,
  );
  return result.rows;
}

/** Which of these numbers belong to an account, and whether that account uses Netai. */
export async function readAccountsByDigits(
  digits: readonly string[],
): Promise<Map<string, { user_id: number; netai_user: boolean }>> {
  const result = await query<{ digits: string; user_id: number; netai_user: boolean }>(
    `SELECT DISTINCT ON (${DIGITS('up.phone')}) ${DIGITS('up.phone')} AS digits,
            u.id AS user_id, ${joinedNetai('u')} AS netai_user
       FROM "UserPhone" up JOIN "User" u ON u.id = up."userId" AND u."deletedAt" IS NULL
      WHERE ${DIGITS('up.phone')} = ANY($1::text[])
      ORDER BY ${DIGITS('up.phone')}, u.id`,
    [digits],
    READ_TIMEOUT_MS,
  );
  return new Map(result.rows.map((r) => [r.digits, r]));
}

/** Contacts the base holds any unretracted fact on. */
export async function readDigitsWithFacts(digits: readonly string[]): Promise<Set<string>> {
  const result = await query<{ digits: string }>(
    `SELECT DISTINCT ${DIGITS('neo4j_contact_id')} AS digits FROM contact_facts
      WHERE retracted_at IS NULL AND ${DIGITS('neo4j_contact_id')} = ANY($1::text[])`,
    [digits],
    READ_TIMEOUT_MS,
  );
  return new Set(result.rows.map((r) => r.digits));
}

export async function readRoster(): Promise<RosterMember[]> {
  return rosterMembers(AXEL_GROUP);
}

export interface MemberActivity {
  readonly id: number;
  readonly ask_opted_out: boolean;
  readonly blocks_set: number;
  readonly asks_sent_24h: number;
  readonly asks_received_24h: number;
  readonly asks_sent_total: number;
  readonly asks_received_total: number;
  readonly open_goals: number;
  readonly needs_noted: number;
  readonly profile_answers: number;
}

/** What each account did through Netai — counts only, never the text. */
export async function readMemberActivity(
  userIds: readonly number[],
): Promise<Map<number, MemberActivity>> {
  const result = await query<MemberActivity>(
    `SELECT u.id,
            EXISTS (SELECT 1 FROM ask_optouts o WHERE o.user_id = u.id) AS ask_opted_out,
            (SELECT COUNT(*) FROM "UserBlock" b WHERE b."blockerId" = u.id)::int AS blocks_set,
            (SELECT COUNT(*) FROM task_asks a WHERE a.from_user_id = u.id
               AND a.created_at > NOW() - INTERVAL '24 hours')::int AS asks_sent_24h,
            (SELECT COUNT(*) FROM task_asks a WHERE a.to_user_id = u.id
               AND a.created_at > NOW() - INTERVAL '24 hours')::int AS asks_received_24h,
            (SELECT COUNT(*) FROM task_asks a WHERE a.from_user_id = u.id)::int AS asks_sent_total,
            (SELECT COUNT(*) FROM task_asks a WHERE a.to_user_id = u.id)::int AS asks_received_total,
            (SELECT COUNT(*) FROM tasks t WHERE t.user_id = u.id::text AND t.status = 'open')::int
              AS open_goals,
            (SELECT COUNT(*) FROM user_notes n WHERE n.user_id = u.id::text AND n.kind = 'need')::int
              AS needs_noted,
            (SELECT COUNT(*) FROM answer_events ae WHERE ae.user_id = u.id
               AND ae.answered_at IS NOT NULL AND NOT ae.skipped)::int AS profile_answers
       FROM "User" u WHERE u.id = ANY($1::int[])`,
    [userIds],
    READ_TIMEOUT_MS,
  );
  return new Map(result.rows.map((r) => [r.id, r]));
}
