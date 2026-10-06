import { query } from '../db/postgres/client';
import { normalizePhone } from './phone';
import { getUserProfile } from './userProfile.service';

/**
 * #1354 (Giorgi, 5 Oct): a member asked Netai about himself and was told
 * „I have no public information about you" and „your number is not visible",
 * while two other people asking about him in the same minutes were told his
 * profession. Every search drops the owner's own phones, and nothing read the
 * facts others see about him. This is his own view of all of it.
 *
 * What others see is the PUBLIC facts saved under his number (crowd-confirmed
 * or approved). Who saved them is never said (the spirit of D523), and facts
 * that are not public stay out — they are shown to nobody, him included.
 */
const ABOUT_ME_TIMEOUT_MS = 5_000;
const MAX_OWN_NUMBERS = 5;
const MAX_PUBLIC_FACTS = 40;

export interface PublicFact {
  readonly field_type: string;
  readonly value: string;
}

export interface AboutMe {
  readonly name: string | null;
  readonly own_numbers: readonly string[];
  readonly my_profile: Readonly<Record<string, string>>;
  readonly what_others_see: readonly PublicFact[];
}

async function ownName(userId: string): Promise<string | null> {
  const result = await query<{ name: string | null }>(
    'SELECT name FROM "User" WHERE id = $1 LIMIT 1',
    [userId],
    ABOUT_ME_TIMEOUT_MS,
  );
  return result.rows[0]?.name?.trim() || null;
}

async function ownNumbers(userId: string): Promise<string[]> {
  const result = await query<{ phone: string }>(
    'SELECT phone FROM "UserPhone" WHERE "userId" = $1 ORDER BY phone LIMIT $2',
    [userId, MAX_OWN_NUMBERS],
    ABOUT_ME_TIMEOUT_MS,
  );
  return result.rows.map((r) => r.phone);
}

async function publicFactsAbout(numbers: readonly string[]): Promise<PublicFact[]> {
  const ids = [...new Set(numbers.map((n) => normalizePhone(n)).filter((n) => n !== ''))];
  if (ids.length === 0) return [];
  const result = await query<PublicFact>(
    `SELECT DISTINCT field_type, COALESCE(canonical_value, value) AS value
       FROM contact_facts
      WHERE neo4j_contact_id = ANY($1::text[]) AND is_public = true AND retracted_at IS NULL
      ORDER BY field_type, value
      LIMIT $2`,
    [ids, MAX_PUBLIC_FACTS],
    ABOUT_ME_TIMEOUT_MS,
  );
  return result.rows;
}

export async function whatNetaiKnowsAboutMe(userId: string): Promise<AboutMe> {
  const [name, numbers, profile] = await Promise.all([
    ownName(userId),
    ownNumbers(userId),
    getUserProfile(userId),
  ]);
  return {
    name,
    own_numbers: numbers,
    my_profile: profile,
    what_others_see: await publicFactsAbout(numbers),
  };
}
