import { query } from '../db/postgres/client';

const QUERY_TIMEOUT_MS = 8_000;
const NOTES_LIMIT = 100;

export const USER_NOTE_KINDS = ['need', 'preference', 'profile'] as const;
export type UserNoteKind = (typeof USER_NOTE_KINDS)[number];

export interface UserNote {
  id: number;
  kind: string;
  text: string;
  created_at: string;
}

export function isUserNoteKind(v: string): v is UserNoteKind {
  return (USER_NOTE_KINDS as readonly string[]).includes(v);
}

/** Save something the user told the assistant about THEMSELF. Notes accumulate. */
export async function saveUserNote(
  userId: string,
  kind: UserNoteKind,
  text: string,
): Promise<{ id: number }> {
  const result = await query<{ id: number }>(
    `INSERT INTO user_notes (user_id, kind, text)
     VALUES ($1, $2, $3)
     RETURNING id`,
    [userId, kind, text],
    QUERY_TIMEOUT_MS,
  );
  return { id: result.rows[0].id };
}

/** Read the user's own notes back — loaded at session start alongside get_my_tasks. */
export async function getUserNotes(userId: string, kind?: UserNoteKind): Promise<UserNote[]> {
  const result = await query<UserNote>(
    `SELECT id, kind, text, created_at
     FROM user_notes
     WHERE user_id = $1 AND ($2::text IS NULL OR kind = $2)
     ORDER BY created_at DESC
     LIMIT $3`,
    [userId, kind ?? null, NOTES_LIMIT],
    QUERY_TIMEOUT_MS,
  );
  return result.rows;
}
