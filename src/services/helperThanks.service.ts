import { query } from '../db/postgres/client';
import {
  againCardText,
  againChoices,
  notedLine,
  thankCardText,
  thankChoices,
  thankedLine,
  thanksToHelperLine,
  ThanksTap,
} from './helperThanksCards';
import { sendPushNotification } from './notification.service';
import { RunLanguage } from './runLanguage';
import {
  ASKED_AS_THE_ASKER_SAVED_THEM,
  ASKER_AS_THE_READER_SAVED_THEM,
  nameAsSavedBySql,
} from './savedNameSql';
import { saveThreadMessage, userLanguage } from './threads.service';

/**
 * 1692 part 1 (A9, D679/D680): a „helped" debrief offers the asker one card —
 * „shall I thank X for you?" — and then one private tap — „would you ask X
 * again?". A yes sends the helper one fixed line in the helper's own
 * conversation, rung once (push quiet hours apply). Nothing of the asker's
 * typed words, and no result line: the result told in the assistant's own
 * words is part 2 (D44), as are the bridges of a chain and the day-14 note.
 */
const QUERY_TIMEOUT_MS = 5_000;
const PUSH_BODY_CHARS = 120;

interface AskForThanks {
  readonly task_id: number | null;
  readonly helper_user_id: number;
  readonly card_thread_id: number | null;
  readonly helper_name: string | null;
}

async function askForThanks(askerUserId: string, askId: number): Promise<AskForThanks | null> {
  const result = await query<AskForThanks>(
    `SELECT ta.task_id, ta.to_user_id AS helper_user_id,
            COALESCE(ta.origin_thread_id, (SELECT t.thread_id FROM tasks t WHERE t.id = ta.task_id))
              AS card_thread_id,
            ${ASKED_AS_THE_ASKER_SAVED_THEM} AS helper_name
       FROM task_asks ta
      WHERE ta.id = $1 AND ta.from_user_id = $2::int AND ta.parent_ask_id IS NULL
      LIMIT 1`,
    [askId, askerUserId],
    QUERY_TIMEOUT_MS,
  );
  return result.rows[0] ?? null;
}

/** The card, once per answered ask. Best-effort: a debrief never fails on it. */
export async function offerHelperThanks(askerUserId: string, askId: number): Promise<boolean> {
  const ask = await askForThanks(askerUserId, askId);
  const helper = ask?.helper_name?.trim() ?? '';
  if (ask === null || ask.card_thread_id === null || helper === '') return false;
  const opened = await query<{ id: number }>(
    `INSERT INTO helper_thanks (ask_id, task_id, asker_user_id, helper_user_id, card_thread_id)
     VALUES ($1, $2, $3::int, $4, $5)
     ON CONFLICT (ask_id) DO NOTHING
     RETURNING id`,
    [askId, ask.task_id, askerUserId, ask.helper_user_id, ask.card_thread_id],
    QUERY_TIMEOUT_MS,
  );
  if (opened.rows.length === 0) return false;
  const language = await userLanguage(askerUserId);
  await saveThreadMessage(
    ask.card_thread_id,
    Number(askerUserId),
    'assistant',
    thankCardText(language, helper),
    'message',
    null,
    thankChoices(language),
  );
  return true;
}

interface OpenThanks {
  readonly id: number;
  readonly ask_id: number;
  readonly asker_user_id: number;
  readonly helper_user_id: number;
  readonly helper_thread_id: number | null;
  readonly helper_name: string | null;
  readonly asker_name: string | null;
}

async function thanksWaitingHere(
  userId: string,
  threadId: number,
  state: 'offered' | 'decided',
): Promise<OpenThanks | null> {
  const result = await query<OpenThanks>(
    `SELECT ht.id, ht.ask_id, ht.asker_user_id, ht.helper_user_id, ta.ask_thread_id AS helper_thread_id,
            ${ASKED_AS_THE_ASKER_SAVED_THEM} AS helper_name,
            ${ASKER_AS_THE_READER_SAVED_THEM} AS asker_name
       FROM helper_thanks ht JOIN task_asks ta ON ta.id = ht.ask_id
      WHERE ht.card_thread_id = $1 AND ht.asker_user_id = $2::int AND ht.state = $3
      ORDER BY ht.id DESC LIMIT 1`,
    [threadId, userId, state],
    QUERY_TIMEOUT_MS,
  );
  return result.rows[0] ?? null;
}

interface Thanked {
  readonly user_id: number;
  readonly thread_id: number | null;
  readonly asker_name: string | null;
}

/** One line to one person, in their language, rung once. */
async function thankOne(person: Thanked): Promise<boolean> {
  const asker = person.asker_name?.trim() ?? '';
  if (person.thread_id === null || asker === '') return false;
  const language = await userLanguage(String(person.user_id));
  const text = thanksToHelperLine(language, asker);
  await saveThreadMessage(person.thread_id, person.user_id, 'assistant', text);
  await sendPushNotification(String(person.user_id), {
    title: 'Netai',
    body: text.slice(0, PUSH_BODY_CHARS),
    url: `/chat/${person.thread_id}`,
  }).catch(() => undefined);
  return true;
}

/** A chain is never longer than this many relays (the relay cap). */
const MAX_CHAIN_PEOPLE = 6;

/**
 * 1692: „one message to the helper and to each bridge of the chain". The ask
 * the asker sent may have been relayed on; everyone it went through who
 * answered is thanked, each in their own conversation, the asker named as
 * each of them saved her.
 */
async function downstreamOf(row: OpenThanks): Promise<Thanked[]> {
  const result = await query<Thanked>(
    `WITH RECURSIVE chain AS (
       SELECT id, to_user_id, ask_thread_id, status, 1 AS depth FROM task_asks WHERE parent_ask_id = $1
       UNION ALL
       SELECT a.id, a.to_user_id, a.ask_thread_id, a.status, c.depth + 1
         FROM task_asks a JOIN chain c ON a.parent_ask_id = c.id
        WHERE c.depth < $3
     )
     SELECT DISTINCT ON (ch.to_user_id) ch.to_user_id AS user_id, ch.ask_thread_id AS thread_id,
            ${nameAsSavedBySql('ch.to_user_id', '$2::int')} AS asker_name
       FROM chain ch
      WHERE ch.status = 'answered' AND ch.to_user_id <> $2::int
      ORDER BY ch.to_user_id, ch.id
      LIMIT $3`,
    [row.ask_id, row.asker_user_id, MAX_CHAIN_PEOPLE],
    QUERY_TIMEOUT_MS,
  );
  return result.rows;
}

/** The helper (the person asked) and everyone further down the chain. */
async function thankTheHelper(row: OpenThanks): Promise<boolean> {
  const first = await thankOne({
    user_id: row.helper_user_id,
    thread_id: row.helper_thread_id,
    asker_name: row.asker_name,
  });
  const further = await downstreamOf(row).catch(() => []);
  for (const person of further) await thankOne(person);
  return first;
}

/** What the asker reads after a tap, and the buttons that come with it. */
export interface ThanksReply {
  readonly text: string;
  readonly choices?: readonly string[];
}

async function settleThankCard(
  row: OpenThanks,
  tap: ThanksTap,
  language: RunLanguage,
): Promise<ThanksReply> {
  const helper = row.helper_name?.trim() ?? '';
  const thank = tap === ThanksTap.Thank;
  const thanked = thank && (await thankTheHelper(row));
  await query(
    `UPDATE helper_thanks
        SET state = 'decided', share_result = $2, decided_at = NOW(),
            thanked_at = CASE WHEN $3::boolean THEN NOW() END
      WHERE id = $1`,
    [row.id, thank ? 'thanks_only' : 'no', thanked],
    QUERY_TIMEOUT_MS,
  );
  const again = againCardText(language, helper);
  return {
    text: thanked ? `${thankedLine(language, helper)} ${again}` : again,
    choices: againChoices(language),
  };
}

/** A tap on one of the two cards, acted on. Null when no card waits in this conversation. */
export async function settleThanksTap(
  userId: string,
  threadId: number,
  tap: ThanksTap,
  language: RunLanguage,
): Promise<ThanksReply | null> {
  const firstCard = tap === ThanksTap.Thank || tap === ThanksTap.DoNotThank;
  const row = await thanksWaitingHere(userId, threadId, firstCard ? 'offered' : 'decided');
  if (row === null) return null;
  if (firstCard) return settleThankCard(row, tap, language);
  await query(
    `UPDATE helper_thanks SET state = 'asked_again', ask_again = $2 WHERE id = $1`,
    [row.id, tap === ThanksTap.AgainYes],
    QUERY_TIMEOUT_MS,
  );
  return { text: notedLine(language) };
}
