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

/**
 * Save something the user told the assistant about THEMSELF. Notes accumulate,
 * but the SAME text is never stored twice ("keep answers short" existed four
 * times) — a duplicate save returns the existing row's id.
 */
export async function saveUserNote(
  userId: string,
  kind: UserNoteKind,
  text: string,
): Promise<{ id: number }> {
  const existing = await query<{ id: number }>(
    `SELECT id FROM user_notes
     WHERE user_id = $1 AND kind = $2 AND LOWER(TRIM(text)) = LOWER(TRIM($3))
     LIMIT 1`,
    [userId, kind, text],
    QUERY_TIMEOUT_MS,
  );
  if (existing.rows.length > 0) return { id: existing.rows[0].id };

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
  // Save-time dedupe only guards NEW rows; duplicates saved before it existed
  // still sit in the table. Collapse them on read (case/whitespace-insensitive,
  // newest kept) so every surface — in-app context and the connector's
  // get_user_notes alike — sees each note once.
  const seen = new Set<string>();
  return result.rows.filter((n) => {
    const key = `${n.kind}|${n.text.trim().toLowerCase().replace(/\s+/g, ' ')}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Delete saved notes by id, for their owner only.
 *
 * Nothing could remove a note from any seat — the founder's saved
 * preferences silently shortened every list and there was no way to take one
 * back (Ticket 9 Task 19.4).
 */
export async function deleteUserNotes(userId: string, ids: number[]): Promise<{ deleted: number }> {
  if (ids.length === 0) return { deleted: 0 };
  const result = await query(
    'DELETE FROM user_notes WHERE user_id = $1 AND id = ANY($2::bigint[])',
    [userId, ids],
    QUERY_TIMEOUT_MS,
  );
  return { deleted: result.rowCount ?? 0 };
}

/**
 * The tone preference as a thing the profile page can read and write (Ticket
 * 11 Task 9, the optional P2 control). No new store: it is one `preference`
 * note with a fixed prefix, the same note the assistant already honours when
 * the user says „მოკლედ" or „be warmer" in chat.
 */
export const TONE_NOTE_PREFIX = 'ტონი: ';
const MAX_TONE_CHARS = 200;

export interface TonePreference {
  id: number;
  tone: string;
}

export async function getTonePreference(userId: string): Promise<TonePreference | null> {
  const result = await query<{ id: number; text: string }>(
    `SELECT id, text FROM user_notes
     WHERE user_id = $1 AND kind = 'preference' AND text LIKE $2 || '%'
     ORDER BY created_at DESC LIMIT 1`,
    [userId, TONE_NOTE_PREFIX],
    QUERY_TIMEOUT_MS,
  );
  const row = result.rows[0];
  return row ? { id: row.id, tone: row.text.slice(TONE_NOTE_PREFIX.length).trim() } : null;
}

/** One tone at a time: the previous tone notes go, the new one is saved. */
export async function setTonePreference(userId: string, tone: string): Promise<TonePreference> {
  const clean = tone.replace(/\s+/g, ' ').trim().slice(0, MAX_TONE_CHARS);
  if (clean === '') throw new Error('tone is required');
  await clearTonePreference(userId);
  const { id } = await saveUserNote(userId, 'preference', `${TONE_NOTE_PREFIX}${clean}`);
  return { id, tone: clean };
}

export async function clearTonePreference(userId: string): Promise<{ deleted: number }> {
  const result = await query(
    `DELETE FROM user_notes WHERE user_id = $1 AND kind = 'preference' AND text LIKE $2 || '%'`,
    [userId, TONE_NOTE_PREFIX],
    QUERY_TIMEOUT_MS,
  );
  return { deleted: result.rowCount ?? 0 };
}
