import { query } from '../db/postgres/client';
import { confirmedWarmTieSql } from './chorusCap';
import { decodeContactRef } from './mcp/contactRef';
import { normalizePhone, phoneDigits } from './phone';
import { isDisplayableTag } from './tools/getContactFullProfile';
import { fetchAccountStates, isMemberPhone } from './tools/membership';

/**
 * The frontend's 06:30Z item 4, the contact's own page: what THIS person keeps
 * about one of their contacts — their own labels, how close they said they
 * are, their own facts, and the goals they kept this contact out of. Nothing
 * another member saved, and never the contact's own topic boundary (D421: the
 * asker is never told a boundary exists).
 */
const QUERY_TIMEOUT_MS = 5_000;
const MAX_LABELS = 50;
const MAX_FACTS = 100;
const MAX_EXCLUSIONS = 50;
const ROLE_FIELDS: readonly string[] = ['occupation', 'employer'];

export enum Warmth {
  Warm = 'warm',
  Neutral = 'neutral',
  Distant = 'distant',
}

export interface ContactFact {
  readonly field: string;
  readonly value: string;
  readonly saved_at: string;
}

export interface ContactExclusionView {
  readonly excluded_for: string;
  readonly reason: string | null;
}

export interface ContactPageView {
  readonly id: string;
  readonly name: string | null;
  readonly role: string | null;
  readonly on_netai: boolean;
  readonly labels: readonly string[];
  readonly warmth: Warmth;
  readonly facts: readonly ContactFact[];
  readonly exclusions: readonly ContactExclusionView[];
}

async function savedName(userId: number, phone: string): Promise<string | null | undefined> {
  const result = await query<{ alias: string | null }>(
    `SELECT alias FROM "UserAlias"
      WHERE "contactId" = $1 AND regexp_replace(phone, '\\D', '', 'g') = $2
      ORDER BY LENGTH(COALESCE(alias, '')) DESC LIMIT 1`,
    [userId, phoneDigits(phone)],
    QUERY_TIMEOUT_MS,
  );
  // undefined: not in this person's phonebook at all.
  return result.rows.length === 0 ? undefined : (result.rows[0].alias?.trim() ?? null);
}

async function ownLabels(userId: number, phone: string): Promise<string[]> {
  const result = await query<{ tag: string }>(
    `SELECT tag FROM "UserTags"
      WHERE "contactId" = $1 AND regexp_replace(phone, '\\D', '', 'g') = $2
      GROUP BY tag ORDER BY SUM("weightCount") DESC, tag LIMIT $3`,
    [userId, phoneDigits(phone), MAX_LABELS],
    QUERY_TIMEOUT_MS,
  );
  return result.rows.map((r) => r.tag).filter(isDisplayableTag);
}

/**
 * Warm: a tie the person confirmed (green/blue tier, allies/loyal, „close").
 * Distant: they marked the tie red. Everything else is neutral — a computed
 * score is a guess and never decides (chorusCap's rule).
 */
async function warmthOf(userId: number, phone: string): Promise<Warmth> {
  const result = await query<{ warm: boolean; distant: boolean }>(
    `SELECT ${confirmedWarmTieSql('$1::int', '$2')} AS warm,
            EXISTS (SELECT 1 FROM human_relationship_tiers h
                     WHERE h.user_id = $1::int AND h.tier = 'red'
                       AND regexp_replace(h.contact_phone, '\\D', '', 'g') = $3) AS distant`,
    [userId, phone, phoneDigits(phone)],
    QUERY_TIMEOUT_MS,
  );
  const row = result.rows[0];
  if (row?.warm === true) return Warmth.Warm;
  return row?.distant === true ? Warmth.Distant : Warmth.Neutral;
}

async function ownFacts(userId: number, phone: string): Promise<ContactFact[]> {
  const result = await query<ContactFact>(
    `SELECT field_type AS field, COALESCE(canonical_value, value) AS value,
            TO_CHAR(created_at, 'YYYY-MM-DD') AS saved_at
       FROM contact_facts
      WHERE neo4j_contact_id = $1 AND submitted_by_user_id = $2 AND retracted_at IS NULL
      ORDER BY field_type, updated_at DESC LIMIT $3`,
    [normalizePhone(phone), String(userId), MAX_FACTS],
    QUERY_TIMEOUT_MS,
  );
  return result.rows;
}

async function exclusionsOf(userId: number, phone: string): Promise<ContactExclusionView[]> {
  const result = await query<ContactExclusionView>(
    `SELECT excluded_for, reason FROM contact_exclusions
      WHERE user_id = $1::int AND contact_phone = $2
      ORDER BY created_at DESC LIMIT $3`,
    [userId, phoneDigits(phone), MAX_EXCLUSIONS],
    QUERY_TIMEOUT_MS,
  );
  return result.rows;
}

/** „accountant · Bank of Georgia" from the person's own role facts, or null. */
export function roleFrom(facts: readonly ContactFact[]): string | null {
  const parts = ROLE_FIELDS.map((field) => facts.find((f) => f.field === field)?.value).filter(
    (v): v is string => typeof v === 'string' && v.trim() !== '',
  );
  return parts.length === 0 ? null : parts.join(' · ');
}

/** The page; null when the id is not one of this person's contacts. */
export async function contactPageFor(userId: number, id: string): Promise<ContactPageView | null> {
  const phone = decodeContactRef(String(userId), id);
  if (phone === null) return null;
  const name = await savedName(userId, phone);
  if (name === undefined) return null;
  const [labels, warmth, facts, exclusions, accounts] = await Promise.all([
    ownLabels(userId, phone),
    warmthOf(userId, phone),
    ownFacts(userId, phone),
    exclusionsOf(userId, phone),
    fetchAccountStates([phone]),
  ]);
  return {
    id,
    name: name !== null && /\p{L}/u.test(name) ? name : null,
    role: roleFrom(facts),
    on_netai: isMemberPhone(accounts, phone),
    labels,
    warmth,
    facts,
    exclusions,
  };
}
