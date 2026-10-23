import { query } from '../db/postgres/client';
import { sendNetaiMessage } from './netaiMessage.service';

/**
 * #7591 WAR ROOM (founder, 24 Oct 02:01 Tbilisi): one card per person and one
 * thing the team should act on. Netai finds them itself; the founder leaves an
 * instruction on each; a worker drafts later and he approves (#7360 sends).
 *
 * Four kinds, real accounts only (never a fictional test seat):
 *  - new_joiner: joined in the last three days and Netai has not written to him;
 *  - unanswered_reply: he answered a Netai message and nothing came back;
 *  - stuck_goal: an open goal with no activity for a day;
 *  - tech_error: his conversation ended on a technical error in the last two days.
 *
 * A card's brief carries no numbers (D149 for cards) and only his own words and
 * Netai's — never another member's labels.
 */

export enum CardKind {
  NewJoiner = 'new_joiner',
  UnansweredReply = 'unanswered_reply',
  StuckGoal = 'stuck_goal',
  TechError = 'tech_error',
}

export const CARD_STATUSES = [
  'new',
  'instructed',
  'drafted',
  'approved',
  'sent',
  'held',
  'dropped',
] as const;
export type CardStatus = (typeof CARD_STATUSES)[number];

export interface CardCandidate {
  readonly userId: number;
  readonly kind: CardKind;
  readonly subjectKey: string;
  readonly threadId: number | null;
  readonly taskId: number | null;
}

export interface CardBrief {
  readonly who: string;
  readonly their_words: string | null;
  readonly netai_did: string | null;
  readonly stalled: string;
}

export interface WarRoomCard {
  readonly id: number;
  readonly user_id: number;
  readonly kind: CardKind;
  readonly thread_id: number | null;
  readonly task_id: number | null;
  readonly brief: CardBrief;
  readonly status: CardStatus;
  readonly instruction: string | null;
  readonly instruction_by: string | null;
  readonly instruction_at: string | null;
  readonly draft: string | null;
  readonly draft_by: string | null;
  readonly draft_at: string | null;
  readonly sent_message_id: number | null;
  readonly sent_by: string | null;
  readonly sent_at: string | null;
  readonly created_at: string;
  readonly updated_at: string;
}

const CARD_COLUMNS = `id, user_id, kind, thread_id, task_id, brief, status, instruction, instruction_by,
  instruction_at, draft, draft_by, draft_at, sent_message_id, sent_by, sent_at, created_at, updated_at`;

const QUERY_TIMEOUT_MS = 10_000;
const MAX_PER_KIND = 50;
const MAX_LIST = 200;
const BRIEF_CHARS = 300;
const NEW_JOINER_DAYS = 3;
const STUCK_AFTER_HOURS = 24;
const STUCK_LOOKBACK_DAYS = 14;
const ERROR_LOOKBACK_HOURS = 48;
const NUMBER_RE = /\+?\d[\d\s-]{6,}\d/gu;
const NUMBER_MASK = '…';

const STALLED: Readonly<Record<CardKind, string>> = {
  [CardKind.NewJoiner]: 'Joined in the last three days; Netai has not written to him yet.',
  [CardKind.UnansweredReply]: 'He answered a Netai message; nothing came back.',
  [CardKind.StuckGoal]: 'An open goal with no activity for over a day.',
  [CardKind.TechError]: 'His conversation ended on a technical error.',
};

/**
 * A real account, never a fictional seat and never a deleted one. Compared as
 * text: tasks.user_id is text where the other tables hold an integer.
 */
const REAL_ACCOUNT_SQL = (alias: string): string =>
  `NOT EXISTS (SELECT 1 FROM test_seats s WHERE s.user_id::text = ${alias}::text)
   AND EXISTS (SELECT 1 FROM "User" u WHERE u.id::text = ${alias}::text AND u."deletedAt" IS NULL)`;

/** No phone number or code ever stands on a card. */
export function withoutNumbers(text: string): string {
  return text.replace(NUMBER_RE, NUMBER_MASK);
}

/** One short line of somebody's text for the brief, or null. */
export function briefLine(text: string | null | undefined): string | null {
  const clean = withoutNumbers((text ?? '').replace(/\s+/gu, ' ').trim());
  if (clean === '') return null;
  return clean.length > BRIEF_CHARS ? `${clean.slice(0, BRIEF_CHARS - 1)}…` : clean;
}

async function newJoiners(): Promise<CardCandidate[]> {
  const result = await query<{ user_id: number }>(
    `SELECT t.user_id FROM threads t
      WHERE ${REAL_ACCOUNT_SQL('t.user_id')}
        AND NOT EXISTS (SELECT 1 FROM netai_messages m WHERE m.user_id = t.user_id)
      GROUP BY t.user_id
     HAVING MIN(t.created_at) > NOW() - make_interval(days => $1)
      LIMIT $2`,
    [NEW_JOINER_DAYS, MAX_PER_KIND],
    QUERY_TIMEOUT_MS,
  );
  return result.rows.map((r) => ({
    userId: Number(r.user_id),
    kind: CardKind.NewJoiner,
    subjectKey: `u:${r.user_id}`,
    threadId: null,
    taskId: null,
  }));
}

async function unansweredReplies(): Promise<CardCandidate[]> {
  const result = await query<{ id: number; user_id: number; thread_id: number }>(
    `SELECT m.id, m.user_id, m.thread_id FROM netai_messages m
      WHERE m.reply IS NOT NULL AND ${REAL_ACCOUNT_SQL('m.user_id')}
        AND NOT EXISTS (SELECT 1 FROM netai_messages later
                         WHERE later.user_id = m.user_id AND later.sent_at > m.replied_at)
      ORDER BY m.replied_at DESC
      LIMIT $1`,
    [MAX_PER_KIND],
    QUERY_TIMEOUT_MS,
  );
  return result.rows.map((r) => ({
    userId: Number(r.user_id),
    kind: CardKind.UnansweredReply,
    subjectKey: `nm:${r.id}`,
    threadId: Number(r.thread_id),
    taskId: null,
  }));
}

async function stuckGoals(): Promise<CardCandidate[]> {
  const result = await query<{ id: number; user_id: number; thread_id: number | null }>(
    `SELECT t.id, t.user_id, t.thread_id FROM tasks t
      WHERE t.status = 'open' AND ${REAL_ACCOUNT_SQL('t.user_id')}
        AND t.last_activity_at < NOW() - make_interval(hours => $1)
        AND t.last_activity_at > NOW() - make_interval(days => $2)
      ORDER BY t.last_activity_at
      LIMIT $3`,
    [STUCK_AFTER_HOURS, STUCK_LOOKBACK_DAYS, MAX_PER_KIND],
    QUERY_TIMEOUT_MS,
  );
  return result.rows.map((r) => ({
    userId: Number(r.user_id),
    kind: CardKind.StuckGoal,
    subjectKey: `t:${r.id}`,
    threadId: r.thread_id === null ? null : Number(r.thread_id),
    taskId: Number(r.id),
  }));
}

async function technicalErrors(): Promise<CardCandidate[]> {
  const result = await query<{ thread_id: number; user_id: number }>(
    `SELECT th.id AS thread_id, th.user_id FROM threads th
      WHERE ${REAL_ACCOUNT_SQL('th.user_id')}
        AND th.updated_at > NOW() - make_interval(hours => $1)
        AND (SELECT c.kind FROM conversations c
              WHERE c.thread_id = th.id AND c.kind IN ('message', 'error')
              ORDER BY c.created_at DESC, c.id DESC LIMIT 1) = 'error'
      LIMIT $2`,
    [ERROR_LOOKBACK_HOURS, MAX_PER_KIND],
    QUERY_TIMEOUT_MS,
  );
  return result.rows.map((r) => ({
    userId: Number(r.user_id),
    kind: CardKind.TechError,
    subjectKey: `e:${r.thread_id}`,
    threadId: Number(r.thread_id),
    taskId: null,
  }));
}

/** Everything the four detectors find now. */
export async function findCardCandidates(): Promise<CardCandidate[]> {
  const found = await Promise.all([
    newJoiners(),
    unansweredReplies(),
    stuckGoals(),
    technicalErrors(),
  ]);
  return found.flat();
}

async function lastLine(threadId: number, role: 'user' | 'assistant'): Promise<string | null> {
  const result = await query<{ content: string }>(
    `SELECT content FROM conversations
      WHERE thread_id = $1 AND role = $2 AND kind = 'message' AND TRIM(content) <> ''
      ORDER BY created_at DESC, id DESC LIMIT 1`,
    [threadId, role],
    QUERY_TIMEOUT_MS,
  );
  return briefLine(result.rows[0]?.content);
}

async function accountName(userId: number): Promise<string> {
  const result = await query<{ name: string | null }>(
    `SELECT name FROM "User" WHERE id = $1`,
    [userId],
    QUERY_TIMEOUT_MS,
  );
  return briefLine(result.rows[0]?.name) ?? `#${userId}`;
}

/** Who, his own last words, what Netai said last, and where it stalled. */
export async function briefFor(candidate: CardCandidate): Promise<CardBrief> {
  const [who, theirWords, netaiDid] = await Promise.all([
    accountName(candidate.userId),
    candidate.threadId === null ? null : lastLine(candidate.threadId, 'user'),
    candidate.threadId === null ? null : lastLine(candidate.threadId, 'assistant'),
  ]);
  return { who, their_words: theirWords, netai_did: netaiDid, stalled: STALLED[candidate.kind] };
}

/** One card per (kind, subject); a card already there keeps its status and instruction. */
async function upsertCard(candidate: CardCandidate, brief: CardBrief): Promise<void> {
  await query(
    `INSERT INTO war_room_cards (user_id, kind, subject_key, thread_id, task_id, brief)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb)
     ON CONFLICT (kind, subject_key)
     DO UPDATE SET brief = EXCLUDED.brief, updated_at = NOW()
      WHERE war_room_cards.status = 'new'`,
    [
      candidate.userId,
      candidate.kind,
      candidate.subjectKey,
      candidate.threadId,
      candidate.taskId,
      JSON.stringify(brief),
    ],
    QUERY_TIMEOUT_MS,
  );
}

/** Find, brief and store every card; returns how many candidates were seen. */
export async function buildWarRoomCards(): Promise<number> {
  const candidates = await findCardCandidates();
  for (const candidate of candidates) {
    await upsertCard(candidate, await briefFor(candidate));
  }
  return candidates.length;
}

/** The cards, newest first, optionally of one status. */
export async function listWarRoomCards(status?: CardStatus): Promise<WarRoomCard[]> {
  const result = await query<WarRoomCard>(
    `SELECT ${CARD_COLUMNS}
       FROM war_room_cards
      WHERE ($1::text IS NULL OR status = $1)
      ORDER BY created_at DESC
      LIMIT $2`,
    [status ?? null, MAX_LIST],
    QUERY_TIMEOUT_MS,
  );
  return result.rows;
}

export interface CardChange {
  readonly instruction?: string;
  readonly draft?: string;
  readonly status?: CardStatus;
  readonly by: string;
}

/**
 * The founder's instruction, a draft for the card, or a status move. An
 * instruction on a new card makes it „instructed"; a draft on a new or
 * instructed card makes it „drafted"; an explicit status always wins. A card
 * being sent or already sent is never changed.
 */
export async function updateWarRoomCard(
  cardId: number,
  change: CardChange,
): Promise<WarRoomCard | null> {
  const instruction = change.instruction?.trim() || null;
  const draft = change.draft?.trim() || null;
  const result = await query<WarRoomCard>(
    `UPDATE war_room_cards SET
        instruction    = COALESCE($2, instruction),
        instruction_by = CASE WHEN $2::text IS NULL THEN instruction_by ELSE $4 END,
        instruction_at = CASE WHEN $2::text IS NULL THEN instruction_at ELSE NOW() END,
        draft          = COALESCE($5, draft),
        draft_by       = CASE WHEN $5::text IS NULL THEN draft_by ELSE $4 END,
        draft_at       = CASE WHEN $5::text IS NULL THEN draft_at ELSE NOW() END,
        status = COALESCE($3,
          CASE WHEN $5::text IS NOT NULL AND status IN ('new', 'instructed') THEN 'drafted'
               WHEN $2::text IS NOT NULL AND status = 'new' THEN 'instructed'
               ELSE status END),
        updated_at = NOW()
      WHERE id = $1 AND sent_by IS NULL
      RETURNING ${CARD_COLUMNS}`,
    [cardId, instruction, change.status ?? null, change.by, draft],
    QUERY_TIMEOUT_MS,
  );
  return result.rows[0] ?? null;
}

export enum SendRefusal {
  NoSuchCard = 'no_such_card',
  AlreadySent = 'already_sent',
  NoText = 'no_text',
}

export type CardSend =
  | { readonly sent: true; readonly card: WarRoomCard; readonly messageId: number }
  | { readonly sent: false; readonly reason: SendRefusal };

/** Claims the card for one send: the first approval holds it, a second is refused. */
async function claimForSending(cardId: number, by: string): Promise<WarRoomCard | null> {
  const result = await query<WarRoomCard>(
    `UPDATE war_room_cards SET sent_by = $2, updated_at = NOW()
      WHERE id = $1 AND sent_by IS NULL
      RETURNING ${CARD_COLUMNS}`,
    [cardId, by],
    QUERY_TIMEOUT_MS,
  );
  return result.rows[0] ?? null;
}

async function cardExists(cardId: number): Promise<boolean> {
  const result = await query<{ found: boolean }>(
    `SELECT EXISTS (SELECT 1 FROM war_room_cards WHERE id = $1) AS found`,
    [cardId],
    QUERY_TIMEOUT_MS,
  );
  return result.rows[0]?.found === true;
}

async function markSent(cardId: number, messageId: number): Promise<WarRoomCard> {
  const result = await query<WarRoomCard>(
    `UPDATE war_room_cards
        SET status = 'sent', sent_message_id = $2, sent_at = NOW(), updated_at = NOW()
      WHERE id = $1
      RETURNING ${CARD_COLUMNS}`,
    [cardId, messageId],
    QUERY_TIMEOUT_MS,
  );
  return result.rows[0] as WarRoomCard;
}

/** A send that did not happen frees the card for the next approval. */
async function releaseClaim(cardId: number): Promise<void> {
  await query(
    `UPDATE war_room_cards SET sent_by = NULL, updated_at = NOW()
      WHERE id = $1 AND sent_message_id IS NULL`,
    [cardId],
    QUERY_TIMEOUT_MS,
  );
}

/**
 * #7591 step 6 (D881): the founder approves the final text and Netai sends it
 * to the person as its own message (#7360). The text is his edit when he gives
 * one, else the card's draft. One card is sent once.
 */
export async function sendWarRoomCard(
  cardId: number,
  by: string,
  editedText?: string,
): Promise<CardSend> {
  if (!(await cardExists(cardId))) return { sent: false, reason: SendRefusal.NoSuchCard };
  const card = await claimForSending(cardId, by);
  if (card === null) return { sent: false, reason: SendRefusal.AlreadySent };
  const text = editedText?.trim() || card.draft?.trim() || '';
  if (text === '') {
    await releaseClaim(cardId);
    return { sent: false, reason: SendRefusal.NoText };
  }
  try {
    const message = await sendNetaiMessage({ userId: card.user_id, text, choices: [], sentBy: by });
    return { sent: true, card: await markSent(cardId, message.id), messageId: message.id };
  } catch (err) {
    await releaseClaim(cardId);
    throw err;
  }
}

export interface UserThreadRow {
  readonly id: number;
  readonly type: string;
  readonly status: string | null;
  readonly title: string | null;
  readonly updated_at: string;
  readonly last_line: string | null;
}

/** #7591 step 1: one person's conversations, newest first, each with its last line (no numbers). */
export async function threadsOfUser(userId: number): Promise<UserThreadRow[]> {
  const result = await query<UserThreadRow>(
    `SELECT th.id, th.type, th.status, COALESCE(th.short_title, th.title) AS title, th.updated_at,
            (SELECT c.content FROM conversations c
              WHERE c.thread_id = th.id AND c.kind = 'message' AND TRIM(c.content) <> ''
              ORDER BY c.created_at DESC, c.id DESC LIMIT 1) AS last_line
       FROM threads th
      WHERE th.user_id = $1
      ORDER BY th.updated_at DESC
      LIMIT $2`,
    [userId, MAX_LIST],
    QUERY_TIMEOUT_MS,
  );
  return result.rows.map((r) => ({ ...r, last_line: briefLine(r.last_line) }));
}
