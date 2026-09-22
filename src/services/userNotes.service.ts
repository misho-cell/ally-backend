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
 * WHAT A SAVED NOTE ACTUALLY DOES, travelling with every save, because the
 * model was telling people it does something it does not.
 *
 * Measured by the tester twice on the live build, 22 September:
 *
 *   14:11:49  a user tells their OWN assistant „I do not want to be asked
 *             anything about plumbers. Never pass me those questions."
 *   14:12:2x  save_user_note ok — and the assistant replies „Got it, noted:
 *             no questions about plumbers or plumbing will come your way."
 *   14:12:54  a DIFFERENT user opens a plumber goal
 *   14:13:43  plan v1 names her
 *   14:14:52  the ask is sent to her, and is sitting in her chat
 *
 * Two minutes thirty, nothing capped, nothing throttled. The note is real: it
 * saves, it persists, her own assistant reads it back to her. Every read of
 * `user_notes` in this codebase is `WHERE user_id = $1` — the owner's context,
 * their tone, their export, their connector. Nobody else's search, plan or
 * send can see it, and `text` is free prose with no topic in it, so nothing
 * COULD match it to a plan without putting every note through a model.
 *
 * The boundary needs a store it does not have — (user_id, topic), read by
 * other people's searches — and `ask_optouts`, the one store shaped for it, is
 * `(user_id, reason, created_at)` with nothing reading `reason`: a boolean per
 * person, which is why it is the only door and why people press it over
 * something small.
 *
 * That store is the founder's decision and is not built here. What IS fixed
 * here is the sentence: Misho's word, 22 September — take the promise off. A
 * note that is saved is confirmed as saved, and nothing is claimed about what
 * it will stop. Of the two faults, telling somebody they are protected when
 * they are not is the worse one, and it is the one that could be mended today.
 */
export const NOTE_SCOPE =
  'Read by this user’s own assistant only. It does not reach anyone else’s ' +
  'search, plan or ask.';

/**
 * THE FIRST VERSION OF THIS WAS 484 CHARACTERS AND THE MODEL PROMISED ANYWAY,
 * THREE TIMES OUT OF THREE, TWENTY MINUTES AFTER IT SHIPPED.
 *
 * The tester ran the measurement I asked for and it disproved the hypothesis I
 * stated with it. I had written that a promise surviving the fix „would mean
 * the scope field is not reaching the model". It reached the model: all three
 * calls logged `result_keys` „saved,scope", 484 characters of it. The model
 * read it and wrote „კითხვებს არ დაგისვამ" — I will not put those questions to
 * you — in the live language, twice out of two.
 *
 * So the layer was right and the SHAPE was wrong. A field named `scope`
 * carrying four sentences of reasoning reads as background, and background
 * loses to the sentence the user just asked for. This is the rule, named as a
 * rule, short enough that it cannot be skimmed past, and it forbids the exact
 * words that were produced rather than the idea behind them.
 *
 * THIRD VERSION, 16:20, AND THE TESTER'S DIAGNOSIS OF IT WAS WRONG IN A WAY
 * THAT CHANGES THE FIX. Thread 22111 came back „ესეც შენახულია, ფანჯრების
 * ოსტატებზე აღარაფერს გკითხავენ" — they will no longer ask you anything. They
 * read it as „a word the list does not have". The list HAS it: „that they will
 * not be asked" is the second forbidden clause, and that Georgian is exactly
 * it, in the third person plural.
 *
 * So it is not a coverage gap, and a fifth English clause would not close it.
 * It is one refusal to follow a rule that already says the thing — 3 clean of
 * 4. What is added instead is the Georgian ITSELF, verbatim: every form the
 * model has actually produced today, in the language the failures happen in,
 * rather than more abstraction in the language they do not.
 *
 * It is longer than the 288 characters that worked 3 of 4, and I do not know
 * whether brevity or the `reply_rule` naming is what made that one work — the
 * 484-character failure differed in both. Attempt three, with no claim that it
 * holds. If it fails again the answer is not a fourth wording: it is that the
 * assistant should not be composing this sentence at all.
 *
 * What it still cannot reach is the STEP line, and that is not a second bug to
 * fix here: the step is the model's own narration BEFORE the call, so the tool
 * result does not exist yet when it is written. Only the tool DESCRIPTION is in
 * front of the model at that moment, and it carries the same rule.
 */
export const NOTE_REPLY_RULE =
  'Say only that the note is saved, in one short line, in their language. Do ' +
  'NOT promise that questions will stop, that they will not be asked, or that ' +
  'anyone will stop asking them. Banned in Georgian, verbatim: ' +
  '„კითხვებს არ დაგისვამ", „აღარაფერს გკითხავ", „აღარაფერს გკითხავენ", ' +
  '„არ მიგიწვდენ", „აღარ მოგივა". Other assistants cannot see this note, so ' +
  'all of that is false.';

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
