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
  followingUpLine,
} from './helperThanksCards';
import { ANSWER_DEBRIEF_ON } from './answerDebriefSwitch';
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
        AND ta.status = 'answered' AND ta.declined_at IS NULL
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
    // A day-14 following-up row gives way to the card: a late helped still thanks them.
    `INSERT INTO helper_thanks (ask_id, task_id, asker_user_id, helper_user_id, card_thread_id)
     VALUES ($1, $2, $3::int, $4, $5)
     ON CONFLICT (ask_id) DO UPDATE
       SET state = 'offered', card_thread_id = EXCLUDED.card_thread_id
       WHERE helper_thanks.state = 'followed_up'
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

/**
 * §113.1 (Misho, 9 Oct; ops 10:24Z): a goal the owner closes as solved, after
 * a helper answered on it, offers the same card a „helped" debrief does. The
 * newest real answer on the goal is the one thanked; the card is still once
 * per ask, so a debrief that offered it already leaves nothing to do here.
 */
export async function offerThanksForSolvedGoal(
  askerUserId: string,
  taskId: number,
): Promise<boolean> {
  const answered = await query<{ id: number }>(
    `SELECT id FROM task_asks
      WHERE task_id = $1 AND from_user_id = $2::int AND parent_ask_id IS NULL
        AND status = 'answered' AND declined_at IS NULL
      ORDER BY answered_at DESC NULLS LAST, id DESC
      LIMIT 1`,
    [taskId, askerUserId],
    QUERY_TIMEOUT_MS,
  );
  const askId = answered.rows[0]?.id;
  return askId === undefined ? false : offerHelperThanks(askerUserId, askId);
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

type LineAbout = (language: RunLanguage, asker: string) => string;

/** One line to one person, in their language, rung once. */
async function thankOne(person: Thanked, write: LineAbout = thanksToHelperLine): Promise<boolean> {
  const asker = person.asker_name?.trim() ?? '';
  if (person.thread_id === null || asker === '') return false;
  const language = await userLanguage(String(person.user_id));
  const text = write(language, asker);
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
): Promise<ThanksReply | null> {
  const helper = row.helper_name?.trim() ?? '';
  const thank = tap === ThanksTap.Thank;
  // Claimed before anything is sent: a yes arriving twice in a second thanks once.
  const claimed = await query<{ id: number }>(
    `UPDATE helper_thanks
        SET state = 'decided', share_result = $2, decided_at = NOW()
      WHERE id = $1 AND state = 'offered'
      RETURNING id`,
    [row.id, thank ? 'thanks_only' : 'no'],
    QUERY_TIMEOUT_MS,
  );
  if (claimed.rows.length === 0) return null;
  const thanked = thank && (await thankTheHelper(row));
  if (thanked) {
    await query(
      `UPDATE helper_thanks SET thanked_at = NOW() WHERE id = $1`,
      [row.id],
      QUERY_TIMEOUT_MS,
    );
  }
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
  const stored = await query<{ id: number }>(
    `UPDATE helper_thanks SET state = 'asked_again', ask_again = $2
      WHERE id = $1 AND state = 'decided' RETURNING id`,
    [row.id, tap === ThanksTap.AgainYes],
    QUERY_TIMEOUT_MS,
  );
  return stored.rows.length === 0 ? null : { text: notedLine(language) };
}

/** Day 14 after the helper's answer, with no word from the asker. */
const QUIET_LEAD_DAYS = 14;
/** At most this many a day, so a backlog never floods anyone. */
const QUIET_LEADS_PER_RUN = 100;

interface QuietLead extends Thanked {
  readonly ask_id: number;
  readonly task_id: number | null;
  readonly asker_user_id: number;
}

/**
 * 1692 part 2: an answer whose „how did it go?" (AV) the asker never answered
 * gets, on day 14, one line to the helper — „Nino is following up your lead",
 * no fact — and a helper_thanks row, so it is said once. Only answers whose
 * debrief was armed, so nothing happens while ANSWER_DEBRIEF_ON is off.
 */
export async function followUpQuietLeads(): Promise<number> {
  if (!ANSWER_DEBRIEF_ON) return 0;
  const due = await query<QuietLead>(
    `SELECT ta.id AS ask_id, ta.task_id, ta.from_user_id AS asker_user_id,
            ta.to_user_id AS user_id, ta.ask_thread_id AS thread_id,
            ${ASKER_AS_THE_READER_SAVED_THEM} AS asker_name
       FROM task_asks ta
       JOIN debrief_arms d ON d.kind = 'answered_ask' AND d.ref_id = ta.id
      WHERE ta.status = 'answered' AND ta.declined_at IS NULL
        AND ta.answered_at < NOW() - make_interval(days => $1)
        AND NOT EXISTS (SELECT 1 FROM helper_thanks h WHERE h.ask_id = ta.id)
        AND NOT EXISTS (SELECT 1 FROM outcome_events o
                         WHERE o.subject_type = 'task_ask' AND o.subject_id = ta.id::text)
      ORDER BY ta.id LIMIT $2`,
    [QUIET_LEAD_DAYS, QUIET_LEADS_PER_RUN],
    QUERY_TIMEOUT_MS,
  );
  let said = 0;
  for (const lead of due.rows) {
    const claimed = await query<{ id: number }>(
      `INSERT INTO helper_thanks (ask_id, task_id, asker_user_id, helper_user_id, state)
       VALUES ($1, $2, $3, $4, 'followed_up')
       ON CONFLICT (ask_id) DO NOTHING RETURNING id`,
      [lead.ask_id, lead.task_id, lead.asker_user_id, lead.user_id],
      QUERY_TIMEOUT_MS,
    );
    if (claimed.rows.length > 0 && (await thankOne(lead, followingUpLine))) said += 1;
  }
  return said;
}
