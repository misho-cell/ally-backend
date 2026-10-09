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
import { ASKED_AS_THE_ASKER_SAVED_THEM, ASKER_AS_THE_READER_SAVED_THEM } from './savedNameSql';
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
    `SELECT ht.id, ht.helper_user_id, ta.ask_thread_id AS helper_thread_id,
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

/** The one line to the helper, in the helper's language, rung once. */
async function thankTheHelper(row: OpenThanks): Promise<boolean> {
  const asker = row.asker_name?.trim() ?? '';
  if (row.helper_thread_id === null || asker === '') return false;
  const language = await userLanguage(String(row.helper_user_id));
  const text = thanksToHelperLine(language, asker);
  await saveThreadMessage(row.helper_thread_id, row.helper_user_id, 'assistant', text);
  await sendPushNotification(String(row.helper_user_id), {
    title: 'Netai',
    body: text.slice(0, PUSH_BODY_CHARS),
    url: `/chat/${row.helper_thread_id}`,
  }).catch(() => undefined);
  return true;
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
