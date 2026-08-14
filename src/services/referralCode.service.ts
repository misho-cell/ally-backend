import { randomInt } from 'crypto';
import { query } from '../db/postgres/client';

// Unambiguous alphabet: no 0/O, 1/I/L — a code read aloud over a phone call
// must survive the trip (founder decision: registration invites by CODE).
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 8;
const CODE_GENERATION_ATTEMPTS = 5;

function generateCode(): string {
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  }
  return code;
}

/** The user's referral code, minted on first read. */
export async function getOrCreateReferralCode(userId: string): Promise<string> {
  const existing = await query<{ referral_code: string | null }>(
    'SELECT referral_code FROM "User" WHERE id = $1 LIMIT 1',
    [userId],
  );
  const current = existing.rows[0]?.referral_code;
  if (current) return current;
  for (let attempt = 0; attempt < CODE_GENERATION_ATTEMPTS; attempt++) {
    const code = generateCode();
    // The partial unique index arbitrates the race: a collision (or a
    // concurrent mint on the same user) leaves rowCount 0 and we retry/reread.
    const updated = await query(
      `UPDATE "User" SET referral_code = $1 WHERE id = $2 AND referral_code IS NULL`,
      [code, userId],
    ).catch(() => null);
    if (updated && (updated.rowCount ?? 0) > 0) return code;
    const reread = await query<{ referral_code: string | null }>(
      'SELECT referral_code FROM "User" WHERE id = $1 LIMIT 1',
      [userId],
    );
    if (reread.rows[0]?.referral_code) return reread.rows[0].referral_code;
  }
  throw new Error('ვერ მოხერხდა რეფერალის კოდის შექმნა — სცადე თავიდან');
}

export interface ReferrerLookup {
  userId: number;
  subscribed: boolean;
}

/** Resolve a referral code to its owner; `subscribed` per the gate's statuses. */
export async function findUserByReferralCode(code: string): Promise<ReferrerLookup | null> {
  const trimmed = code.trim().toUpperCase();
  if (!trimmed) return null;
  const result = await query<{ id: number; subscription_status: string | null }>(
    `SELECT id, subscription_status FROM "User"
     WHERE UPPER(referral_code) = $1 AND "deletedAt" IS NULL
     LIMIT 1`,
    [trimmed],
  );
  const row = result.rows[0];
  if (!row) return null;
  return {
    userId: row.id,
    subscribed: row.subscription_status === 'active' || row.subscription_status === 'trialing',
  };
}
