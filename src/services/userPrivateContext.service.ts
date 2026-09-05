import { query } from '../db/postgres/client';

export async function getPrivateContext(userId: string): Promise<Record<string, string>> {
  const result = await query<{ key: string; value: string }>(
    'SELECT key, value FROM user_private_context WHERE user_id = $1 ORDER BY key',
    [userId],
  );
  return Object.fromEntries(result.rows.map((r) => [r.key, r.value]));
}

export async function savePrivateContext(
  userId: string,
  key: string,
  rawValue: string,
  mode: 'set' | 'append',
): Promise<void> {
  const value = stripPhoneNumbers(rawValue);
  if (mode === 'append') {
    await query(
      `INSERT INTO user_private_context (user_id, key, value)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id, key) DO UPDATE
       SET value = user_private_context.value || E'\n' || $3,
           updated_at = NOW()`,
      [userId, key, value],
    );
  } else {
    await query(
      `INSERT INTO user_private_context (user_id, key, value)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id, key) DO UPDATE
       SET value = $3,
           updated_at = NOW()`,
      [userId, key, value],
    );
  }
}

// A phone number must never be stored here (Ticket 9 Task 19.3: the founder's
// private context held three in plain text). Georgian mobiles, +995 forms and
// bare 9-digit runs all count.
const PHONE_RE = /(\+?995[\s-]?)?\(?\d{3}\)?[\s-]?\d{2}[\s-]?\d{2}[\s-]?\d{2,3}/g;
const PHONE_PLACEHOLDER = '[ნომერი წაშლილია]';

/**
 * Strip phone numbers before anything is written to private context.
 *
 * The assistant writes here on its own; nobody could read the store back or
 * delete a line, so a number saved by accident stayed forever and rode on
 * every call. Stripping at the door is the only place this can be enforced
 * once, for every writer.
 */
export function stripPhoneNumbers(value: string): string {
  return value.replace(PHONE_RE, PHONE_PLACEHOLDER);
}

export interface PrivateContextLine {
  key: string;
  value: string;
  updated_at: string;
}

/** The whole store, so a person can see what is held about them and remove it. */
export async function listPrivateContext(userId: string): Promise<PrivateContextLine[]> {
  const result = await query<PrivateContextLine>(
    `SELECT key, value, TO_CHAR(updated_at, 'YYYY-MM-DD') AS updated_at
     FROM user_private_context WHERE user_id = $1 ORDER BY key`,
    [userId],
  );
  return result.rows;
}

/** Delete keys from one account's private context. Returns how many went. */
export async function deletePrivateContextKeys(
  userId: string,
  keys: string[],
): Promise<{ deleted: number }> {
  if (keys.length === 0) return { deleted: 0 };
  const result = await query(
    'DELETE FROM user_private_context WHERE user_id = $1 AND key = ANY($2::text[])',
    [userId, keys],
  );
  return { deleted: result.rowCount ?? 0 };
}

export interface ScrubOutcome {
  scanned: number;
  changed: number;
  users: number;
  samples: string[];
}

/**
 * Strip phone numbers from what is ALREADY stored (ticket 9 task 19.3).
 *
 * The guard at the door only protects new writes. The founder's own context
 * still carried a number in plain text inside a line he asked to keep — the
 * store rides on every call he makes, and until this ran nobody could remove
 * it: there was no way to edit a value, only to delete the whole key.
 *
 * Dry-run by default. Values are rewritten through the same scrubber the
 * writer uses, so the two can never disagree.
 */
export async function scrubStoredPhoneNumbers(dryRun = true): Promise<ScrubOutcome> {
  const rows = await query<{ user_id: string; key: string; value: string }>(
    `SELECT user_id, key, value FROM user_private_context`,
    [],
  );
  const dirty = rows.rows.filter((r) => stripPhoneNumbers(r.value) !== r.value);
  const outcome: ScrubOutcome = {
    scanned: rows.rows.length,
    changed: dirty.length,
    users: new Set(dirty.map((r) => r.user_id)).size,
    samples: dirty.slice(0, 5).map((r) => `${r.user_id}/${r.key}`),
  };
  if (dryRun || dirty.length === 0) return outcome;
  for (const row of dirty) {
    await query(
      `UPDATE user_private_context SET value = $3, updated_at = NOW()
       WHERE user_id = $1 AND key = $2`,
      [row.user_id, row.key, stripPhoneNumbers(row.value)],
    );
  }
  return outcome;
}
