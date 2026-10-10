import { query } from '../db/postgres/client';

/**
 * The frontend's 06:30Z item 7 (onboarding B6/B7, the contact sync page): when
 * the person last imported their phonebook, how many contacts that import
 * brought, how many they hold now, and their monthly reminder switch.
 *
 * Read from migration 106's record of every import. An import still running,
 * or one that brought nothing, is not „the last import": the page says when
 * the phonebook last really arrived.
 */
const QUERY_TIMEOUT_MS = 5_000;

export interface ContactImportState {
  readonly last_import_at: string | null;
  readonly last_import_count: number;
  readonly count: number;
  readonly monthly_reminder: boolean;
}

interface StateRow {
  readonly last_import_at: string | null;
  readonly last_import_count: number | null;
  readonly count: number;
  readonly monthly_reminder: boolean | null;
}

export async function contactImportState(userId: number): Promise<ContactImportState> {
  const result = await query<StateRow>(
    `SELECT last.created_at AS last_import_at, last.imported AS last_import_count,
            (SELECT COUNT(DISTINCT ua.phone)::int FROM "UserAlias" ua
              WHERE ua."contactId" = $1) AS count,
            (SELECT u.contact_import_reminder FROM "User" u WHERE u.id = $1) AS monthly_reminder
       FROM (SELECT 1) one
       LEFT JOIN LATERAL (
         SELECT ia.created_at, ia.imported FROM import_attempts ia
          WHERE ia.user_id = $1 AND ia.imported > 0 AND NOT ia.in_progress
          ORDER BY ia.created_at DESC LIMIT 1
       ) last ON TRUE`,
    [userId],
    QUERY_TIMEOUT_MS,
  );
  const row = result.rows[0];
  return {
    last_import_at: row?.last_import_at ?? null,
    last_import_count: row?.last_import_count ?? 0,
    count: row?.count ?? 0,
    monthly_reminder: row?.monthly_reminder ?? false,
  };
}

export async function setContactImportReminder(userId: number, on: boolean): Promise<void> {
  await query(
    `UPDATE "User" SET contact_import_reminder = $2 WHERE id = $1`,
    [userId, on],
    QUERY_TIMEOUT_MS,
  );
}
