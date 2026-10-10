import { query } from '../db/postgres/client';
import { decodeContactRef } from './mcp/contactRef';
import { accountDetailsFor, fetchAccountStates } from './tools/membership';

/**
 * The frontend's item 9, the member card (task 389; §127, Misho: „ფრონტის
 * სია"): name, role · company, city, areas and what the member is open to.
 * Every field the member hid in their own settings stays hidden: work under
 * `hideUserWorkInfo`, areas and offers under `hideUserTags`.
 *
 * Keyed by the same sealed id the owner's contacts list carries, so a card is
 * only ever opened for a person the server itself referred this owner to.
 */
const CARD_QUERY_TIMEOUT_MS = 5_000;
const MAX_AREAS = 6;
const MAX_OFFERS = 5;
const AREA_KEYS: readonly string[] = ['industry', 'interests'];
/** Profession is work: it fills the role, under the same hide flag. */
const PROFILE_KEYS: readonly string[] = ['city', 'profession', ...AREA_KEYS];
const LIST_SEPARATOR_RE = /[,;\n]/u;

export interface MemberCard {
  readonly id: string;
  readonly name: string | null;
  readonly role: string | null;
  readonly company: string | null;
  readonly city: string | null;
  readonly areas: readonly string[];
  readonly open_to: readonly string[];
}

interface MemberRow {
  readonly name: string | null;
  readonly job: string | null;
  readonly employer: string | null;
  readonly city: string | null;
  readonly hide_work: boolean | null;
  readonly hide_tags: boolean | null;
}

/** The member behind a sealed id; null when the id is foreign or the person is not on Netai. */
async function memberIdFor(ownerId: number, ref: string): Promise<number | null> {
  const phone = decodeContactRef(String(ownerId), ref);
  if (phone === null) return null;
  const details = accountDetailsFor(await fetchAccountStates([phone]), phone);
  return details.state === 'netai_user' ? details.user_id : null;
}

async function memberRow(memberId: number): Promise<MemberRow | null> {
  const result = await query<MemberRow>(
    `SELECT u.name, u."jobPosition" AS job, u.employer, u.city,
            u."hideUserWorkInfo" AS hide_work, u."hideUserTags" AS hide_tags
       FROM "User" u
      WHERE u.id = $1::int AND u."deletedAt" IS NULL AND u."disabledAt" IS NULL
      LIMIT 1`,
    [memberId],
    CARD_QUERY_TIMEOUT_MS,
  );
  return result.rows[0] ?? null;
}

async function profileValues(memberId: number): Promise<ReadonlyMap<string, string>> {
  const result = await query<{ key: string; value: string }>(
    `SELECT key, value FROM user_profile_kv
      WHERE user_id = $1::int AND key = ANY($2::text[]) AND value IS NOT NULL
      LIMIT $3`,
    [memberId, PROFILE_KEYS, PROFILE_KEYS.length],
    CARD_QUERY_TIMEOUT_MS,
  );
  return new Map(result.rows.map((row) => [row.key, row.value]));
}

async function openOffers(memberId: number): Promise<string[]> {
  const result = await query<{ text: string }>(
    `SELECT text FROM offers WHERE user_id = $1::int AND active
      ORDER BY created_at DESC LIMIT $2`,
    [memberId, MAX_OFFERS],
    CARD_QUERY_TIMEOUT_MS,
  );
  return result.rows.map((row) => row.text.trim()).filter((text) => text !== '');
}

/** The member's areas from their own profile, each once, in the order they wrote them. */
export function areasOf(profile: ReadonlyMap<string, string>): string[] {
  const words = AREA_KEYS.flatMap((key) => (profile.get(key) ?? '').split(LIST_SEPARATOR_RE))
    .map((word) => word.trim())
    .filter((word) => word !== '');
  return [...new Set(words)].slice(0, MAX_AREAS);
}

function filled(value: string | null | undefined): string | null {
  const trimmed = (value ?? '').trim();
  return trimmed === '' ? null : trimmed;
}

/** The card; null when the id is not one this owner was given, or the person is not a member. */
export async function memberCardFor(ownerId: number, ref: string): Promise<MemberCard | null> {
  const memberId = await memberIdFor(ownerId, ref);
  if (memberId === null) return null;
  const row = await memberRow(memberId);
  if (row === null) return null;
  const [profile, offers] = await Promise.all([profileValues(memberId), openOffers(memberId)]);
  const showWork = row.hide_work !== true;
  const showTags = row.hide_tags !== true;
  return {
    id: ref,
    name: filled(row.name),
    role: showWork ? (filled(row.job) ?? filled(profile.get('profession'))) : null,
    company: showWork ? filled(row.employer) : null,
    city: filled(row.city) ?? filled(profile.get('city')),
    areas: showTags ? areasOf(profile) : [],
    open_to: showTags ? offers : [],
  };
}
