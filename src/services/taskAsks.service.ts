import { query } from '../db/postgres/client';
import { getTaskById } from './taskStore.service';
import { createThread, saveThreadMessage } from './threads.service';
import { emitThreadCreated } from './sse.service';
import { sendPushNotification } from './notification.service';
import { scrubText } from './privacyScrub';
import { geoName } from './georgianCase';
import { findContactPhonesByName } from './tools/nameMatch';
import { isOptedOutFromAsks } from './askOptOut.service';
import { isPhoneOptedOut } from './privacyRights.service';
import {
  checkAskBudget,
  checkFollowUpBudget,
  GrowthAskRefusalReason,
  RELAY_MESSAGES_PER_PERSON_PER_DAY,
} from './askBudget.service';
import { setThreadStatus } from './threadStatus.service';
import { armAskDebrief } from './debrief.service';

const ASK_QUERY_TIMEOUT_MS = 8_000;
// The recipient's chat list must distinguish eight questions from the same
// sender — the title carries the question itself, not a generic "კითხვა".
const ASK_TITLE_SNIPPET_CHARS = 48;
// Belt-and-braces for the title only (ticket 4 item 3): when every ask opens
// "გამარჯობა ლიკა!", every row in her list reads the same. The greeting is
// stripped from the TITLE; the message itself is delivered exactly as the
// sender wrote it. Punctuation is required after the greeting so a question
// that merely starts with a similar word is never truncated.
const TITLE_GREETING_PREFIX =
  /^\s*(გამარჯობათ|გამარჯობა|მოგესალმებით|მოგესალმები|სალამი|დილა მშვიდობისა|საღამო მშვიდობისა|hello|hi|hey|dear)(?:\s+[\p{L}.]+){0,2}\s*[,!.\-—]+\s*/iu;

function titleSnippetFrom(question: string): string {
  const stripped = question.replace(TITLE_GREETING_PREFIX, '').trim();
  const body = stripped.length > 0 ? stripped : question.trim();
  return body.length > ASK_TITLE_SNIPPET_CHARS
    ? `${body.slice(0, ASK_TITLE_SNIPPET_CHARS - 1)}…`
    : body;
}
// Anti-runaway ceiling, not a product limit (the product decision is "no
// limits, the user pays tokens") — one account still must not be able to
// blanket the network in a day. Env-adjustable.
const MAX_ASKS_PER_SENDER_PER_DAY = Number(process.env.MAX_ASKS_PER_SENDER_PER_DAY ?? 20);
const MAX_QUESTION_CHARS = 600;

export interface TaskAsk {
  id: number;
  task_id: number;
  to_user_id: number;
  to_name: string | null;
  status: string;
  question: string;
  answer: string | null;
  created_at: string;
}

// Machine-readable refusal codes (ticket 6 close, answers 3/4): the assistant
// and the tester must be able to tell WHY a send was refused without parsing
// Georgian prose — invented causes ("test mode", "opted out") all traced back
// to paraphrased error strings.
export type AskRefusalReason =
  | 'empty_question'
  | 'task_not_open'
  | 'consent_pending'
  | 'recipient_not_member'
  | 'recipient_opted_out'
  | 'recipient_not_subscribed'
  | 'self_send'
  | 'daily_cap_reached'
  | 'conversation_ask_limit_reached'
  | 'monthly_ask_budget_reached'
  | 'person_daily_relay_limit_reached';

export type CreateAskOutcome =
  | { sent: true; ask_id: number; to_name: string }
  | { sent: false; error: string; reason?: AskRefusalReason };

/**
 * What the assistant is told when a budget refuses a send. One table, keyed by
 * the budget's own machine-readable reason, so a refusal can never be reported
 * as something it is not — every invented cause ("test mode", "they opted
 * out") began life as a paraphrased error string.
 */
const RELAY_REFUSALS: Readonly<
  Record<GrowthAskRefusalReason, { reason: AskRefusalReason; error: (toName: string) => string }>
> = {
  conversation_limit_reached: {
    reason: 'conversation_ask_limit_reached',
    error: () =>
      'ამ საუბარში უკვე გაიგზავნა ერთი კითხვა სხვა ადამიანთან — ეს ლიმიტია ' +
      'თითო საუბარზე. მომხმარებელს უთხარი, რომ მეორე ადამიანთან მისაწერად ახალი ' +
      'საუბარი უნდა დაიწყოს.',
  },
  monthly_budget_reached: {
    reason: 'monthly_ask_budget_reached',
    error: () =>
      'ამ თვის კითხვების ლიმიტი ამოწურულია — მომდევნო თვეს განახლდება. ' +
      'მომხმარებელს მშვიდად უთხარი, ბოდიში ან „ტექნიკური შეცდომა" არ ახსენო.',
  },
  // Not a fault and not a technical problem: the conversation is alive, this
  // person has simply had their day's worth of it. Say when it reopens.
  person_daily_relay_limit_reached: {
    reason: 'person_daily_relay_limit_reached',
    error: (toName: string) =>
      `${toName}-სთან ამ მიზანზე დღეს უკვე ${RELAY_MESSAGES_PER_PERSON_PER_DAY} შეტყობინება ` +
      'გაიგზავნა — ეს დღიური ზღვარია ერთ ადამიანზე, რომ საუბარი დატვირთვად არ იქცეს. ' +
      'ხვალ ისევ შესაძლებელი იქნება. მომხმარებელს ეს პირდაპირ უთხარი — არც ბოდიში, არც ' +
      '„ტექნიკური შეფერხება", და არ თქვა, თითქოს ამ ადამიანმა რამე უარყო.',
  },
};

/**
 * The recipient's thread for a NEW conversation: born a task-shaped item
 * awaiting their reply, announced to their devices. A follow-up never comes
 * here — it writes into the thread this one opened.
 */
async function openAskThread(
  toUserId: number,
  senderName: string,
  safeQuestion: string,
): Promise<number> {
  const thread = await createThread(
    String(toUserId),
    'incoming_ask',
    `${senderName}: ${titleSnippetFrom(safeQuestion)}`,
    undefined,
    {
      isTask: true,
      status: 'needs_you',
      statusLine: 'პასუხს ელოდება',
    },
  );
  emitThreadCreated(String(toUserId), {
    id: thread.id,
    type: thread.type,
    title: thread.title,
    is_task: thread.is_task,
    status: thread.status,
    status_line: thread.status_line,
  });
  return thread.id;
}

/**
 * Send a question to ANOTHER member on the task's behalf: creates the ask row,
 * a thread on the recipient's side (type incoming_ask) with the question as
 * the opening assistant message, and a push. The recipient answers with plain
 * text; their assistant relays the approved wording back through
 * sendApprovedAskAnswer, which wakes this task.
 *
 * A goal may write to the same person more than once (ticket 9 task 12): the
 * second and later messages continue the same recipient thread, count against
 * a per-person daily budget instead of the monthly growth one, and each still
 * requires its sender's explicit approval of the exact text.
 */
export async function createAsk(
  fromUserId: string,
  taskId: number,
  contactPhone: string,
  question: string,
  parentAskId?: number,
  threadId?: number,
): Promise<CreateAskOutcome> {
  const trimmed = question.trim().slice(0, MAX_QUESTION_CHARS);
  if (!trimmed)
    return { sent: false, reason: 'empty_question', error: 'Pass a non-empty question.' };

  // SERVER-SIDE permission gate (ticket-2 P0, thread 7723): a message that
  // reaches a real person's phone must never depend on prompt text alone —
  // the rule lived only in the task_step block, and every mode carries every
  // tool, so a quick_answer run created task_331 and fired an ask in one
  // move, permission_granted = false. The gate lives HERE, at the single
  // choke point every surface (in-app dispatch, connector, future callers)
  // must pass through. Relays are exempt by design: a relay is the RECIPIENT
  // forwarding the already-permitted parent ask with their own consent.
  if (parentAskId === undefined) {
    const task = await getTaskById(taskId);
    if (!task || String(task.user_id) !== fromUserId || task.status !== 'open') {
      return { sent: false, reason: 'task_not_open', error: 'Task not found or not open.' };
    }
    if (!task.permission_granted) {
      // The wording matters (ticket 3 §6.8): the old text sent the model back
      // to the user even when consent had JUST been voiced, producing three
      // permission prompts for one send (thread 8152).
      return {
        sent: false,
        reason: 'consent_pending',
        error:
          'ნებართვა არ არის: ამ დავალებაზე grant_task_permission ჯერ არ გამოძახებულა. თუ ' +
          'მომხმარებელს ამ საუბარში თანხმობა უკვე ნათქვამი აქვს („კი, გაუგზავნე") — ხელახლა ' +
          'ნუ ჰკითხავ: გამოიძახე grant_task_permission ახლავე და გაიმეორე ask_contact. თუ ' +
          'თანხმობა ჯერ არ გითხოვია, ჰკითხე ერთხელ და აჩვენე ვის მისწერ და ზუსტად რა ' +
          'ტექსტს. უნებართვოდ გაგზავნა შეუძლებელია — ეს სერვერის წესია.',
      };
    }
  }

  // The recipient must be a registered member (format-independent lookup).
  const member = await query<{
    userId: number;
    name: string | null;
    subscriptionStatus: string | null;
  }>(
    `SELECT up."userId", u.name, u.subscription_status AS "subscriptionStatus"
     FROM "UserPhone" up JOIN "User" u ON u.id = up."userId"
     WHERE regexp_replace(up.phone, '\\D', '', 'g') = regexp_replace($1, '\\D', '', 'g')
       AND u."deletedAt" IS NULL
     LIMIT 1`,
    [contactPhone],
    ASK_QUERY_TIMEOUT_MS,
  );
  if (member.rows.length === 0) {
    return {
      sent: false,
      reason: 'recipient_not_member',
      error: 'ეს კონტაქტი Netai-ს წევრი არ არის — მისწერა ვერ ხერხდება.',
    };
  }
  const toUserId = member.rows[0].userId;
  const toName = member.rows[0].name ?? 'კონტაქტი';

  // Person-level opt-out (ticket 4, item 00) — checked HERE, at send time, and
  // ahead of every other rule: a refusal to be contacted is about the person,
  // not the task, and it must not depend on the assistant's wording. Relays are
  // NOT exempt: a relay is still a message arriving on that person's phone.
  // Two lists, one rule: the account-level opt-out, and the phone-level one
  // that outlives a deleted account (migration 056) — an erased number must
  // not be reachable again just because someone still has it in a contact list.
  if ((await isOptedOutFromAsks(toUserId)) || (await isPhoneOptedOut(contactPhone))) {
    return {
      sent: false,
      reason: 'recipient_opted_out',
      error:
        `${toName}-მ მოითხოვა, რომ Netai-დან შეტყობინებები აღარ მიეღო — ამიტომ მას ვერაფერს ვწერთ, ` +
        'ვერც ამ და ვერც სხვა დავალებაზე. ეს მისი გადაწყვეტილებაა და პატივს ვცემთ. მფლობელს ' +
        'პირდაპირ და მშვიდად უთხარი ეს (არა „ტექნიკური შეფერხება") და შესთავაზე სხვა ადამიანი.',
    };
  }

  // The hand-picked test allowlist is retired (founder's decision, 24 Aug):
  // asks now reach any registered member with an ACTIVE subscription,
  // rather than a fixed list of ids. Worded so it CANNOT be read as the
  // recipient's own choice — same principle as the allowlist message it
  // replaces (12 Aug: the model once translated a similar refusal into "this
  // person switched Netai messages off", a false statement about a third
  // party's settings, ticket 4 item 00-D).
  if (member.rows[0].subscriptionStatus !== 'active') {
    return {
      sent: false,
      reason: 'recipient_not_subscribed',
      error:
        'ვერ გაიგზავნა: ამ ეტაპზე კითხვები მხოლოდ Netai-ს გამომწერ (subscription) წევრებს ' +
        'ეგზავნებათ. ეს ჩვენი სისტემის დროებითი წესია — ამ ადამიანს არაფერი გამოურთავს და ' +
        'მისი ანგარიშის შესახებ არაფერი თქვა. მომხმარებელს უთხარი მხოლოდ: „ამ ეტაპზე ამ ' +
        'ადამიანთან მიწერა ჯერ არ შემიძლია".',
    };
  }

  if (String(toUserId) === fromUserId) {
    return { sent: false, reason: 'self_send', error: 'საკუთარ თავს ვერ მისწერ.' };
  }

  // Is this goal already in a live conversation with this person? If it is,
  // the message continues it (ticket 9 task 12) — same thread on their phone,
  // a different budget, and no new thread row in their list. The old rule
  // ("one task never asks the same person twice") is what stopped Lika from
  // sending Tornike the hour they had just agreed on.
  const live = await query<{ ask_thread_id: number | null }>(
    `SELECT ask_thread_id FROM task_asks
     WHERE task_id = $1 AND to_user_id = $2 AND status IN ('sent', 'answered')
     ORDER BY id DESC LIMIT 1`,
    [taskId, toUserId],
    ASK_QUERY_TIMEOUT_MS,
  );
  const liveThreadId = live.rows[0]?.ask_thread_id ?? null;
  const isFollowUp = liveThreadId !== null;

  // Budgets: server-side, same relay exemption as the permission gate above.
  // Outreach spends the monthly growth budget; a follow-up spends the
  // recipient's patience instead, capped per person per goal per day.
  if (parentAskId === undefined) {
    const budget = isFollowUp
      ? await checkFollowUpBudget(fromUserId, toUserId, taskId)
      : await checkAskBudget(fromUserId, threadId);
    if (!budget.allowed) {
      const refusal = RELAY_REFUSALS[budget.reason ?? 'monthly_budget_reached'];
      return { sent: false, reason: refusal.reason, error: refusal.error(toName) };
    }
  }

  const sentToday = await query<{ count: string }>(
    `SELECT COUNT(*) AS count FROM task_asks
     WHERE from_user_id = $1::int AND created_at > NOW() - INTERVAL '24 hours'`,
    [fromUserId],
    ASK_QUERY_TIMEOUT_MS,
  );
  if (Number(sentToday.rows[0]?.count ?? 0) >= MAX_ASKS_PER_SENDER_PER_DAY) {
    return {
      sent: false,
      reason: 'daily_cap_reached',
      error: 'დღევანდელი მიწერების ლიმიტი ამოიწურა — ხვალ გავაგრძელებ.',
    };
  }

  const fromName = await query<{ name: string | null }>(
    `SELECT name FROM "User" WHERE id = $1::int LIMIT 1`,
    [fromUserId],
    ASK_QUERY_TIMEOUT_MS,
  );
  // Trimmed: a trailing space in the stored name rendered as "**Name **" on
  // the recipient's phone (ticket 3 §6.3).
  const senderName = fromName.rows[0]?.name?.trim() || 'Netai-ს მომხმარებელი';

  // The question crosses accounts — scrub it.
  const safeQuestion = scrubText(trimmed);
  // A follow-up lands in the conversation it belongs to; only a first ask
  // opens a thread. Two threads for one exchange would put the answer and the
  // question that followed it in different rooms (ticket 9 task 12).
  const askThreadId = liveThreadId ?? (await openAskThread(toUserId, senderName, safeQuestion));
  // Plain text, no markdown: the recipient-side renderer shows the asterisks
  // verbatim (ticket 3 §6.3).
  const opening = isFollowUp
    ? `${geoName(senderName, 'gen')} ასისტენტმა კიდევ დაწერა:\n\n"${safeQuestion}"\n\n` +
      'უბრალოდ მიპასუხე ამ თრედში — პასუხს მე გადავცემ.'
    : `${geoName(senderName, 'gen')} ასისტენტი გეკითხება:\n\n"${safeQuestion}"\n\n` +
      'უბრალოდ მიპასუხე ამ თრედში — პასუხს მე გადავცემ.';
  await saveThreadMessage(askThreadId, toUserId, 'assistant', opening);
  // The badge on a continued conversation goes back to waiting-on-them: their
  // last reply closed the previous round, and this is a new one.
  if (isFollowUp) {
    await setThreadStatus(String(toUserId), askThreadId, 'needs_you', {
      statusLine: 'პასუხს ელოდება',
      isTask: true,
    });
  }

  // origin_thread_id is the SENDER's side; ask_thread_id above is the
  // recipient's. Ask 727 rides on a goal whose title has nothing to do with
  // its question, and answering "why" took a reconstruction across two threads
  // because the conversation an ask came out of was never written down
  // (ticket 9 task 20 d).
  const ask = await query<{ id: number }>(
    `INSERT INTO task_asks (task_id, from_user_id, to_user_id, question, ask_thread_id,
                            parent_ask_id, origin_thread_id, is_follow_up)
     VALUES ($1, $2::int, $3, $4, $5, $6, $7, $8)
     RETURNING id`,
    [
      taskId,
      fromUserId,
      toUserId,
      safeQuestion,
      askThreadId,
      parentAskId ?? null,
      threadId ?? null,
      isFollowUp,
    ],
    ASK_QUERY_TIMEOUT_MS,
  );

  void sendPushNotification(String(toUserId), {
    title: `Netai — ${senderName} გეკითხება`,
    body: safeQuestion.slice(0, 120),
    url: `/chat/${askThreadId}`,
  }).catch(() => undefined);

  // D49: a relayed ask reaching 'sent' arms the asker's 3-day debrief — if
  // it is still unanswered by then, the asker hears about it honestly. An
  // answered ask is dropped at release time. Best-effort: the send stands.
  await armAskDebrief(fromUserId, ask.rows[0].id, taskId, toName, isFollowUp).catch(
    (err: unknown) =>
      // eslint-disable-next-line no-console
      console.error('[debrief] ask arm failed:', (err as Error).message),
  );

  return { sent: true, ask_id: ask.rows[0].id, to_name: toName };
}

/**
 * Capture the recipient's plain-text reply. The FIRST message answers the ask
 * (sent → answered) and reports which task to wake; later messages append to
 * the answer without re-waking.
 */
export interface CapturedAnswer {
  askId: number;
  taskId: number;
  firstAnswer: boolean;
  answer: string;
  /** Who answered — the wake event names them (ticket 4 item 0C.3). */
  fromName: string | null;
}

export async function recordAskAnswer(
  askThreadId: number,
  answerText: string,
): Promise<CapturedAnswer | null> {
  const safe = scrubText(answerText.trim());
  if (!safe) return null;
  // Append-window rule (ticket 6 protocol run, task 46): later messages join
  // the answer ONLY until the asker's wake is delivered. After that, whatever
  // the recipient says in this thread is conversation with their own courier
  // agent — an opt-out negotiation appended itself onto ask 829's answer and
  // the verbatim-quote rule would have relayed it into the asker's thread.
  // The LATEST live ask on the thread, not "an" ask: since ticket 9 task 12 a
  // thread can carry several rounds of the same conversation, and round two's
  // answer belongs to round two's question. Without the ordering, one reply
  // would have overwritten every round at once.
  const updated = await query<{ id: number; task_id: number; answer: string }>(
    `UPDATE task_asks
     SET answer = CASE
           WHEN answer IS NULL THEN $2
           WHEN wake_delivered_at IS NULL THEN answer || E'\n' || $2
           ELSE answer
         END,
         status = CASE WHEN status = 'sent' THEN 'answered' ELSE status END,
         answered_at = COALESCE(answered_at, NOW())
     WHERE id = (
       SELECT id FROM task_asks
       WHERE ask_thread_id = $1 AND status IN ('sent', 'answered')
       ORDER BY id DESC LIMIT 1
     )
     RETURNING id, task_id, answer`,
    [askThreadId, safe],
    ASK_QUERY_TIMEOUT_MS,
  );
  const row = updated.rows[0];
  if (!row) return null;
  // firstAnswer = this message IS the whole stored answer, i.e. the round had
  // nothing before it. Read off the updated row itself.
  const firstAnswer = row.answer === safe;
  const check = await query<{ from_name: string | null }>(
    `SELECT u.name AS from_name
     FROM task_asks ta LEFT JOIN "User" u ON u.id = ta.to_user_id
     WHERE ta.id = $1 LIMIT 1`,
    [row.id],
    ASK_QUERY_TIMEOUT_MS,
  );
  // The scrubbed verbatim text rides back so the wake event can carry it —
  // ticket 3 §5: the asker-side agent once presented the thread TITLE as the
  // answer; giving it the exact words in the event kills that failure mode.
  return {
    askId: row.id,
    taskId: row.task_id,
    firstAnswer,
    answer: safe,
    fromName: check.rows[0]?.from_name ?? null,
  };
}

/**
 * Ticket 7 Task 1(c), founder's ruling D48: nothing leaves an incoming-ask
 * thread on its own. This is now the ONLY path an answer takes to the asker —
 * the recipient's assistant composes the text, shows it, and calls this with
 * the exact wording the recipient approved. The old path (the recipient's
 * first raw message auto-captured as the answer before the assistant even
 * ran — asks 892/925's answered_at preceding their own message rows) is
 * removed from threads.routes.
 *
 * Scoped to the recipient: the ask behind this thread must be addressed TO
 * the caller — the thread id comes from server context, but the ownership
 * check stays as belt-and-braces.
 */
export async function sendApprovedAskAnswer(
  recipientUserId: string,
  askThreadId: number,
  approvedText: string,
): Promise<{ sent: boolean; error?: string }> {
  const ask = await query<{ to_user_id: number; status: string }>(
    `SELECT to_user_id, status FROM task_asks
     WHERE ask_thread_id = $1 ORDER BY id DESC LIMIT 1`,
    [askThreadId],
    ASK_QUERY_TIMEOUT_MS,
  );
  const row = ask.rows[0];
  if (!row || String(row.to_user_id) !== recipientUserId) {
    return { sent: false, error: 'ამ თრედს ცოცხალი შემოსული კითხვა არ აქვს.' };
  }
  if (row.status !== 'sent' && row.status !== 'answered') {
    return { sent: false, error: 'ეს კითხვა უკვე დახურულია — პასუხი ვეღარ გაიგზავნება.' };
  }

  const captured = await recordAskAnswer(askThreadId, approvedText);
  if (!captured) {
    return { sent: false, error: 'პასუხის ჩაწერა ვერ მოხერხდა — სცადე ხელახლა.' };
  }

  // Instant wake with the EXACT approved text; the 5-minute unwoken-answer
  // sweep stays as the backstop if this delivery fails. Dynamic import
  // because taskEngine statically imports this file — a static import back
  // would be a load-order cycle.
  if (captured.firstAnswer) {
    try {
      const { wakeTask } = await import('./taskEngine.service');
      const delivered = await wakeTask(
        captured.taskId,
        buildAnswerWakeEvent(captured.answer, captured.fromName),
        { text: captured.answer, who: captured.fromName },
      );
      if (delivered) await markAskWakeDelivered(captured.askId);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[ask-wake] failed (sweep will retry):', (err as Error).message);
    }
  }
  return { sent: true };
}

/**
 * The wake event for an arrived answer. Tag-delimited, NOT quote-wrapped:
 * a quote inside the answer broke the quoted form and the asker received a
 * raw fragment (ticket 4 blocker 3, thread 8201). The responder is named
 * (item 0C.3): an answer that arrives anonymously reads as the assistant's own
 * curiosity, so the owner has no reason to treat it as someone waiting.
 */
export function buildAnswerWakeEvent(answer: string, fromName?: string | null): string {
  const who = fromName?.trim() ? fromName.trim() : 'ადამიანმა, ვისაც კითხვა გაეგზავნა';
  return (
    `${who} გიპასუხა შენს გაგზავნილ კითხვაზე. პასუხის ზუსტი ტექსტი <answer> ტეგებს შორისაა:\n` +
    `<answer>\n${answer}\n</answer>\n` +
    `მფლობელს გადაეცი სიტყვასიტყვით, ციტატად, და დაასახელე ვინ უპასუხა (${who}) — თუ სხვა ენაზეა, ` +
    'თარგმანიც დაურთე. თუ ეს პასუხი კითხვაა, მფლობელს ახსენი, რომ ადამიანი პასუხს ელოდება. ' +
    'შემდეგ გააგრძელე დავალება.'
  );
}

/** What an answer-wake run's final reply MUST contain, verbatim. */
export interface EnsureQuoted {
  readonly text: string;
  readonly who: string | null;
}

const QUOTE_NORM_RE = /\s+/g;

/**
 * Server-side guarantee for the wake event's "გადაეცი სიტყვასიტყვით"
 * instruction: prompt-only enforcement failed live — the first N-01 protocol
 * round (21 Aug, thread 9835) delivered „ეს TBC-ის საბაზისო პირობებია" with
 * the actual answer nowhere in the thread. If the model's reply does not
 * contain the answer text, the quote is prepended — same philosophy as
 * wrapAllowedNumbers: the model is asked, the server makes it true.
 */
export function ensureVerbatimQuote(reply: string, ensure: EnsureQuoted): string {
  const norm = (s: string): string => s.replace(QUOTE_NORM_RE, ' ').trim();
  const answer = ensure.text.trim();
  if (!answer) return reply;
  if (norm(reply).includes(norm(answer))) return reply;
  const attribution = ensure.who?.trim() ? ` — ${ensure.who.trim()}` : '';
  return `„${answer}"${attribution}\n\n${reply}`;
}

/**
 * Is this thread's task waiting on someone else right now? A thread whose ask
 * is unanswered is `waiting`, never `done` — ticket 4 item 0C.5: thread 8416
 * sat in the finished list while the founder was waiting on a reply.
 */
export async function hasPendingAskForThread(threadId: number): Promise<boolean> {
  const result = await query<{ id: number }>(
    `SELECT ta.id
     FROM task_asks ta
     JOIN tasks t ON t.id = ta.task_id
     WHERE t.thread_id = $1 AND ta.status = 'sent'
     LIMIT 1`,
    [threadId],
    ASK_QUERY_TIMEOUT_MS,
  );
  return result.rows.length > 0;
}

export interface UnwokenAnswer {
  id: number;
  task_id: number;
  answer: string | null;
  from_name: string | null;
  task_status: string | null;
}

/** Answered asks whose owning task was never woken — the sweep's worklist. */
export async function listUnwokenAnswers(limit: number): Promise<UnwokenAnswer[]> {
  const result = await query<UnwokenAnswer>(
    `SELECT ta.id, ta.task_id, ta.answer, u.name AS from_name, t.status AS task_status
     FROM task_asks ta
     LEFT JOIN tasks t ON t.id = ta.task_id
     LEFT JOIN "User" u ON u.id = ta.to_user_id
     WHERE ta.status = 'answered'
       AND ta.answered_at IS NOT NULL
       AND ta.wake_delivered_at IS NULL
     ORDER BY ta.answered_at ASC
     LIMIT $1`,
    [limit],
    ASK_QUERY_TIMEOUT_MS,
  );
  return result.rows;
}

export async function markAskWakeDelivered(askId: number): Promise<void> {
  await query(
    `UPDATE task_asks SET wake_delivered_at = NOW() WHERE id = $1`,
    [askId],
    ASK_QUERY_TIMEOUT_MS,
  );
}

/** Everything this task has asked and heard back — for the prompt's task section. */
export async function getAsksForTask(taskId: number): Promise<TaskAsk[]> {
  const result = await query<TaskAsk>(
    `SELECT ta.id, ta.task_id, ta.to_user_id, u.name AS to_name, ta.status,
            ta.question, ta.answer, ta.created_at
     FROM task_asks ta
     LEFT JOIN "User" u ON u.id = ta.to_user_id
     WHERE ta.task_id = $1
     ORDER BY ta.created_at ASC`,
    [taskId],
    ASK_QUERY_TIMEOUT_MS,
  );
  return result.rows;
}

export interface PendingAsk {
  ask_id: number;
  from_name: string | null;
  question: string;
  created_at: string;
}

/**
 * Real questions relayed by another member, still unanswered — a completely
 * different table from introduction_requests (the mediator "who wants to
 * meet whom" flow), and one check_my_inbox never queried. Live-caught (25
 * Aug): two live asks (ids 892, 925) sat on the founder's own inbox sidebar
 * and in /admin/asks, both status 'sent', while the connector's
 * check_my_inbox reported `waiting_for_me: []` twice, an hour apart, in the
 * same run.
 */
export async function getPendingAsksForUser(userId: string): Promise<PendingAsk[]> {
  const result = await query<PendingAsk>(
    `SELECT ta.id AS ask_id, u.name AS from_name, ta.question, ta.created_at
     FROM task_asks ta
     LEFT JOIN "User" u ON u.id = ta.from_user_id
     WHERE ta.to_user_id = $1::int AND ta.status = 'sent'
     ORDER BY ta.created_at ASC`,
    [userId],
    ASK_QUERY_TIMEOUT_MS,
  );
  return result.rows;
}

/** Stop everything in flight when a task closes; tell the recipients honestly. */
export async function cancelAsksForTask(taskId: number): Promise<void> {
  const cancelled = await query<{ ask_thread_id: number | null; to_user_id: number }>(
    `UPDATE task_asks SET status = 'cancelled'
     WHERE task_id = $1 AND status = 'sent'
     RETURNING ask_thread_id, to_user_id`,
    [taskId],
    ASK_QUERY_TIMEOUT_MS,
  );
  for (const row of cancelled.rows) {
    if (row.ask_thread_id === null) continue;
    await saveThreadMessage(
      row.ask_thread_id,
      row.to_user_id,
      'assistant',
      'ეს კითხვა აღარ არის აქტუალური — პასუხი აღარ არის საჭირო. მადლობა!',
    ).catch(() => undefined);
  }
}

export interface IncomingAsk {
  id: number;
  task_id: number;
  question: string;
  from_name: string | null;
  status: string;
}

/** The live ask behind an incoming_ask thread — injected into the recipient's prompt. */
export async function getAskByThread(askThreadId: number): Promise<IncomingAsk | null> {
  const result = await query<IncomingAsk>(
    `SELECT ta.id, ta.task_id, ta.question, ta.status, u.name AS from_name
     FROM task_asks ta
     LEFT JOIN "User" u ON u.id = ta.from_user_id
     WHERE ta.ask_thread_id = $1
     ORDER BY ta.id DESC LIMIT 1`,
    [askThreadId],
    ASK_QUERY_TIMEOUT_MS,
  );
  return result.rows[0] ?? null;
}

// THE fix for ticket 4 items 0A/0AA: a relay failure is NOT an answer failure.
// The recipient's own reply is captured and delivered the instant they send it,
// on a completely separate path; relay_ask is only the EXTRA hop that forwards
// the question to a third person. On 11 Aug the recipient was told "ამის
// გადაცემა ვერ მოხერხდა" four times while the asker had her answer every time —
// she was being shown the result of the contact lookup, not of the delivery.
// Every relay outcome now carries that distinction in the text itself.
const RELAY_ALREADY_DELIVERED =
  ' მნიშვნელოვანი: მომხმარებლის პასუხი კითხვის ავტორს უკვე გადაეცა — ეს ცალკე, ავტომატური გზაა და ' +
  'ყოველთვის მუშაობს. აქ საქმე მხოლოდ დამატებით გადაგზავნას ეხება. არასოდეს თქვა, რომ პასუხი ვერ ' +
  'გადაიცა ან დაიკარგა — ეს ტყუილი იქნებოდა.';
// Appended to every FAILED relay outcome: the model on the recipient's side of
// an ask must close neutrally — a refusal must never surface as "system error"
// and must never end with "contact them directly" (ticket 3 §1, code-enforced
// because two prompt rewrites failed to hold it).
const RELAY_NEUTRAL_CLOSE =
  ' დამატებითი გადაგზავნა ვერ მოხერხდა — მომხმარებელს ეს ერთი მშვიდი წინადადებით უთხარი და ' +
  'აუცილებლად დაამატე, რომ მისი პასუხი კითხვის ავტორმა მიიღო. „სისტემური შეცდომა" არ ახსენო და ' +
  'არასოდეს ურჩიო კითხვის ავტორთან ან სხვასთან პირდაპირ დაკავშირება.' +
  RELAY_ALREADY_DELIVERED;

// A dictated number is used as-is; anything shorter is treated as a name.
const RELAY_PHONE_MIN_DIGITS = 9;
// We only need to distinguish "exactly one" from "several" — never a list.
const RELAY_NAME_MATCH_LIMIT = 3;

// Resolution errors carry their own instructions (including an explicit out
// when the user never asked to forward — ticket 4 blocker 2: relay_ask fired
// on "მაგას თვითონ ვკითხავ" with contact_name "თვითონ", and the neutral-close
// made the refusal read as a malfunction). They must NOT get the neutral-close
// suffix, which is for real send failures only.
const RELAY_EMPTY_NAME_ERROR =
  'კონტაქტის სახელი ცარიელია — გადაგზავნა არ მომხდარა და არც იყო საჭირო.' + RELAY_ALREADY_DELIVERED;
// Ticket 4 item 0C.1b: naming a person IS the answer — a recommendation, not a
// relay request. The name already reached the asker as plain text through the
// automatic capture, so a failed lookup must end in a thank-you, never in an
// apology and never in "spell it for me": no recipient will work out which
// script their own phonebook uses.
const RELAY_NOT_FOUND_ERROR =
  'ეს სახელი მომხმარებლის კონტაქტებში ვერ მოიძებნა, ამიტომ მისთვის ცალკე კითხვა არ გაგზავნილა — ' +
  'და არც არის საჭირო: სახელი კითხვის ავტორს უკვე მივიდა, როგორც რეკომენდაცია. მადლობა უთხარი და ' +
  'დაასრულე. ორთოგრაფია არ ჰკითხო, ვარაუდები ნუ ჩამოთვლი და ბოდიში არ მოიხადო.' +
  RELAY_ALREADY_DELIVERED;
const RELAY_AMBIGUOUS_ERROR =
  'ამ სახელს რამდენიმე კონტაქტი ემთხვევა, ამიტომ ცალკე კითხვა არავის გაგზავნია. თუ მომხმარებელმა ' +
  'გადაგზავნა ნამდვილად ითხოვა, ჰკითხე სრული სახელი და გვარი; თუ უბრალოდ ადამიანს ასახელებდა — ' +
  'მადლობა უთხარი და დაასრულე. კანდიდატები ნუ ჩამოთვლი.' +
  RELAY_ALREADY_DELIVERED;
const RELAY_RESOLUTION_ERRORS: ReadonlySet<string> = new Set([
  RELAY_EMPTY_NAME_ERROR,
  RELAY_NOT_FOUND_ERROR,
  RELAY_AMBIGUOUS_ERROR,
]);

/**
 * Resolve the relay target INSIDE the server, from the relayer's own saved
 * contacts. The incoming_ask context has no search tools by design (ticket 3
 * §1) — candidate names, counts and tags must never enter that context window,
 * so ambiguity comes back as "ask the user for the full name", never as a list.
 */
async function resolveRelayContact(
  relayerUserId: string,
  contact: string,
): Promise<{ phone: string } | { error: string }> {
  const digits = contact.replace(/\D/g, '');
  if (digits.length >= RELAY_PHONE_MIN_DIGITS) return { phone: digits };
  // Same matching standard as search_contacts (ticket 4 item 0C.1): one variant
  // group per word — transliteration and drift folds included — so a name said
  // in Georgian resolves a contact saved in Latin script. The plain lowercase
  // comparison this replaces told a recipient her own saved contact did not
  // exist and asked her to guess the spelling of her own phonebook.
  // (findContactPhonesByName returns [] for an empty query too, same as the
  // inline check this replaced.)
  const matches = await findContactPhonesByName(relayerUserId, contact, RELAY_NAME_MATCH_LIMIT);
  if (matches.length === 0) {
    return { error: contact.trim() === '' ? RELAY_EMPTY_NAME_ERROR : RELAY_NOT_FOUND_ERROR };
  }
  if (matches.length > 1) {
    return { error: RELAY_AMBIGUOUS_ERROR };
  }
  return { phone: matches[0] };
}

/**
 * Relay: the RECIPIENT of an ask forwards it (with their consent, voiced in
 * their own thread) to one of THEIR contacts, named in their words — the
 * server finds the contact. The child ask keeps the original task_id, so C's
 * answer wakes A's task through the normal capture path; B is the sender for
 * caps and dedupe purposes. One level deep by design.
 */
export async function createRelayAsk(
  relayerUserId: string,
  parentAskId: number,
  contact: string,
  question?: string,
): Promise<CreateAskOutcome> {
  const outcome = await relayAskInner(relayerUserId, parentAskId, contact, question);
  if (outcome.sent || RELAY_RESOLUTION_ERRORS.has(outcome.error)) return outcome;
  return { sent: false, error: outcome.error + RELAY_NEUTRAL_CLOSE };
}

async function relayAskInner(
  relayerUserId: string,
  parentAskId: number,
  contact: string,
  question?: string,
): Promise<CreateAskOutcome> {
  const parent = await query<{
    id: number;
    task_id: number;
    to_user_id: number;
    question: string;
    parent_ask_id: number | null;
  }>(
    `SELECT id, task_id, to_user_id, question, parent_ask_id FROM task_asks WHERE id = $1 LIMIT 1`,
    [parentAskId],
    ASK_QUERY_TIMEOUT_MS,
  );
  const row = parent.rows[0];
  if (!row || String(row.to_user_id) !== relayerUserId) {
    return { sent: false, error: 'Ask not found.' };
  }
  if (row.parent_ask_id !== null) {
    return { sent: false, error: 'ეს კითხვა უკვე გადაგზავნილია ერთხელ — ჯაჭვი აქ ჩერდება.' };
  }
  const target = await resolveRelayContact(relayerUserId, contact);
  if ('error' in target) {
    return { sent: false, error: target.error };
  }
  return createAsk(
    relayerUserId,
    row.task_id,
    target.phone,
    question?.trim() || row.question,
    row.id,
  );
}

// One polite reminder per unanswered ask, after this long.
const ASK_REMINDER_AFTER_HOURS = 48;

export async function sendDueAskReminders(limit: number): Promise<number> {
  const due = await query<{ ask_thread_id: number | null; to_user_id: number }>(
    `UPDATE task_asks SET reminded_at = NOW()
     WHERE id IN (
       SELECT id FROM task_asks
       WHERE status = 'sent' AND reminded_at IS NULL
         AND created_at < NOW() - INTERVAL '${ASK_REMINDER_AFTER_HOURS} hours'
       ORDER BY created_at
       LIMIT $1
     )
     RETURNING ask_thread_id, to_user_id`,
    [limit],
    ASK_QUERY_TIMEOUT_MS,
  );
  for (const row of due.rows) {
    if (row.ask_thread_id === null) continue;
    await saveThreadMessage(
      row.ask_thread_id,
      row.to_user_id,
      'assistant',
      'შეხსენება: ეს კითხვა ჯერ უპასუხოა — თუ ერთი წუთი გაქვს, პასუხი ძალიან გამოადგება. თუ არ იცი, ისიც მომწერე და აღარ შეგაწუხებ.',
    ).catch(() => undefined);
    void sendPushNotification(String(row.to_user_id), {
      title: 'Netai — შეხსენება',
      body: 'უპასუხო კითხვა გელოდება.',
      url: `/chat/${row.ask_thread_id}`,
    }).catch(() => undefined);
  }
  return due.rows.length;
}
