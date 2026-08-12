import { query } from '../db/postgres/client';
import { getTaskById } from './taskStore.service';
import { createThread, saveThreadMessage } from './threads.service';
import { emitThreadCreated } from './sse.service';
import { sendPushNotification } from './notification.service';
import { scrubText } from './privacyScrub';
import { buildRawWordGroups, toWordStartPattern } from './tools/transliterate';
import { isOptedOutFromAsks } from './askOptOut.service';
import { isPhoneOptedOut } from './privacyRights.service';

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

export type CreateAskOutcome =
  | { sent: true; ask_id: number; to_name: string }
  | { sent: false; error: string };

/**
 * Send a question to ANOTHER member on the task's behalf: creates the ask row,
 * a thread on the recipient's side (type incoming_ask) with the question as
 * the opening assistant message, and a push. The recipient answers with plain
 * text; the capture in threads.routes lands it back here and wakes the task.
 */
export async function createAsk(
  fromUserId: string,
  taskId: number,
  contactPhone: string,
  question: string,
  parentAskId?: number,
): Promise<CreateAskOutcome> {
  const trimmed = question.trim().slice(0, MAX_QUESTION_CHARS);
  if (!trimmed) return { sent: false, error: 'Pass a non-empty question.' };

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
      return { sent: false, error: 'Task not found or not open.' };
    }
    if (!task.permission_granted) {
      // The wording matters (ticket 3 §6.8): the old text sent the model back
      // to the user even when consent had JUST been voiced, producing three
      // permission prompts for one send (thread 8152).
      return {
        sent: false,
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
  const member = await query<{ userId: number; name: string | null }>(
    `SELECT up."userId", u.name
     FROM "UserPhone" up JOIN "User" u ON u.id = up."userId"
     WHERE regexp_replace(up.phone, '\\D', '', 'g') = regexp_replace($1, '\\D', '', 'g')
       AND u."deletedAt" IS NULL
     LIMIT 1`,
    [contactPhone],
    ASK_QUERY_TIMEOUT_MS,
  );
  if (member.rows.length === 0) {
    return { sent: false, error: 'ეს კონტაქტი Netai-ს წევრი არ არის — მისწერა ვერ ხერხდება.' };
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
      error:
        `${toName}-მ მოითხოვა, რომ Netai-დან შეტყობინებები აღარ მიეღო — ამიტომ მას ვერაფერს ვწერთ, ` +
        'ვერც ამ და ვერც სხვა დავალებაზე. ეს მისი გადაწყვეტილებაა და პატივს ვცემთ. მფლობელს ' +
        'პირდაპირ და მშვიდად უთხარი ეს (არა „ტექნიკური შეფერხება") და შესთავაზე სხვა ადამიანი.',
    };
  }

  // Live-fire safety switch for the incoming_ask test phase: when set (comma-
  // separated user ids), asks may reach ONLY those accounts — a mis-picked
  // contact must not receive a test question about someone else's problem.
  // Unset (the default) = no restriction.
  const allowlist = (process.env.ASK_RECIPIENT_ALLOWLIST ?? '')
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
  if (allowlist.length > 0 && !allowlist.includes(String(toUserId))) {
    // Worded so it CANNOT be read as the recipient's own choice: on 12 Aug the
    // model translated the old text into "this person has switched Netai
    // messages off" — a false statement about a third party's settings
    // (ticket 4 item 00-D).
    return {
      sent: false,
      error:
        'ვერ გაიგზავნა: აპლიკაცია სატესტო რეჟიმშია და კითხვები ამ ეტაპზე მხოლოდ წინასწარ ' +
        'შერჩეულ სატესტო მიმღებებს ეგზავნებათ. ეს ჩვენი, სისტემის დროებითი შეზღუდვაა — ამ ' +
        'ადამიანს არაფერი გამოურთავს და მისი პარამეტრების შესახებ არაფერი თქვა. მომხმარებელს ' +
        'უთხარი მხოლოდ: „სატესტო რეჟიმის გამო ამ ადამიანთან მიწერა ჯერ არ შემიძლია".',
    };
  }

  if (String(toUserId) === fromUserId) {
    return { sent: false, error: 'საკუთარ თავს ვერ მისწერ.' };
  }

  // One task never asks the same person twice.
  const dup = await query<{ id: number }>(
    `SELECT id FROM task_asks
     WHERE task_id = $1 AND to_user_id = $2 AND status IN ('sent', 'answered')
     LIMIT 1`,
    [taskId, toUserId],
    ASK_QUERY_TIMEOUT_MS,
  );
  if (dup.rows.length > 0) {
    return { sent: false, error: 'ამ ადამიანს ამ დავალებაზე უკვე მიწერილი აქვს კითხვა.' };
  }

  const sentToday = await query<{ count: string }>(
    `SELECT COUNT(*) AS count FROM task_asks
     WHERE from_user_id = $1::int AND created_at > NOW() - INTERVAL '24 hours'`,
    [fromUserId],
    ASK_QUERY_TIMEOUT_MS,
  );
  if (Number(sentToday.rows[0]?.count ?? 0) >= MAX_ASKS_PER_SENDER_PER_DAY) {
    return { sent: false, error: 'დღევანდელი მიწერების ლიმიტი ამოიწურა — ხვალ გავაგრძელებ.' };
  }

  const fromName = await query<{ name: string | null }>(
    `SELECT name FROM "User" WHERE id = $1::int LIMIT 1`,
    [fromUserId],
    ASK_QUERY_TIMEOUT_MS,
  );
  // Trimmed: a trailing space in the stored name rendered as "**Name **" on
  // the recipient's phone (ticket 3 §6.3).
  const senderName = fromName.rows[0]?.name?.trim() || 'Netai-ს მომხმარებელი';

  // Recipient-side thread: born a task-shaped item awaiting THEIR reply. The
  // question crosses accounts — scrub it.
  const safeQuestion = scrubText(trimmed);
  const titleSnippet = titleSnippetFrom(safeQuestion);
  const thread = await createThread(
    String(toUserId),
    'incoming_ask',
    `${senderName}: ${titleSnippet}`,
    undefined,
    {
      isTask: true,
      status: 'needs_you',
      statusLine: 'პასუხს ელოდება',
    },
  );
  // Plain text, no markdown: the recipient-side renderer shows the asterisks
  // verbatim (ticket 3 §6.3).
  const opening =
    `${senderName}-ის ასისტენტი გეკითხება:\n\n"${safeQuestion}"\n\n` +
    'უბრალოდ მიპასუხე ამ თრედში — პასუხს მე გადავცემ.';
  await saveThreadMessage(thread.id, toUserId, 'assistant', opening);

  const ask = await query<{ id: number }>(
    `INSERT INTO task_asks (task_id, from_user_id, to_user_id, question, ask_thread_id, parent_ask_id)
     VALUES ($1, $2::int, $3, $4, $5, $6)
     RETURNING id`,
    [taskId, fromUserId, toUserId, safeQuestion, thread.id, parentAskId ?? null],
    ASK_QUERY_TIMEOUT_MS,
  );

  emitThreadCreated(String(toUserId), {
    id: thread.id,
    type: thread.type,
    title: thread.title,
    is_task: thread.is_task,
    status: thread.status,
    status_line: thread.status_line,
  });
  void sendPushNotification(String(toUserId), {
    title: `Netai — ${senderName} გეკითხება`,
    body: safeQuestion.slice(0, 120),
    url: `/chat/${thread.id}`,
  }).catch(() => undefined);

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
  const updated = await query<{ id: number; task_id: number; status: string }>(
    `UPDATE task_asks
     SET answer = CASE WHEN answer IS NULL THEN $2 ELSE answer || E'\n' || $2 END,
         status = CASE WHEN status = 'sent' THEN 'answered' ELSE status END,
         answered_at = COALESCE(answered_at, NOW())
     WHERE ask_thread_id = $1 AND status IN ('sent', 'answered')
     RETURNING id, task_id, status`,
    [askThreadId, safe],
    ASK_QUERY_TIMEOUT_MS,
  );
  const row = updated.rows[0];
  if (!row) return null;
  // firstAnswer = the transition happened in THIS update: answered_at was just
  // set. Detect via a second cheap read of answer history length? Simpler: the
  // status was 'sent' before when answered_at IS NOW — approximate by checking
  // whether the stored answer equals exactly this message.
  const check = await query<{ answer: string; from_name: string | null }>(
    `SELECT ta.answer, u.name AS from_name
     FROM task_asks ta
     LEFT JOIN "User" u ON u.id = ta.to_user_id
     WHERE ta.ask_thread_id = $1 LIMIT 1`,
    [askThreadId],
    ASK_QUERY_TIMEOUT_MS,
  );
  const firstAnswer = (check.rows[0]?.answer ?? '') === safe;
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

// One capture failing during a deploy window loses the wake for a day (ticket
// 4 blocker 1) — retry the transient before giving up; the wake sweep is the
// backstop for whatever still slips through.
const CAPTURE_RETRY_DELAYS_MS = [0, 1_000, 3_000];

export async function recordAskAnswerWithRetry(
  askThreadId: number,
  answerText: string,
): Promise<CapturedAnswer | null> {
  let lastError: unknown;
  for (const delayMs of CAPTURE_RETRY_DELAYS_MS) {
    if (delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs));
    try {
      return await recordAskAnswer(askThreadId, answerText);
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError;
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
  const groups = buildRawWordGroups(contact);
  if (groups.length === 0) {
    return { error: RELAY_EMPTY_NAME_ERROR };
  }
  // Every word must match (AND across groups); within a word any variant does.
  let cursor = 2; // $1 = relayer
  const conds = groups
    .map((group) => {
      const alternatives = group
        .map((_, i) => `(LOWER(label) || '') ~ $${cursor + i}`)
        .join(' OR ');
      cursor += group.length;
      return `(${alternatives})`;
    })
    .join(' AND ');
  const patterns = groups.flat().map(toWordStartPattern);
  const matches = await query<{ digits: string }>(
    `SELECT DISTINCT regexp_replace(phone, '\\D', '', 'g') AS digits
     FROM (
       SELECT ua.phone, ua.alias AS label FROM "UserAlias" ua WHERE ua."contactId" = $1::int
       UNION ALL
       SELECT ut.phone, ut.tag AS label FROM "UserTags" ut WHERE ut."contactId" = $1::int
     ) labels
     WHERE ${conds}
     LIMIT ${RELAY_NAME_MATCH_LIMIT}`,
    [relayerUserId, ...patterns],
    ASK_QUERY_TIMEOUT_MS,
  );
  if (matches.rows.length === 0) {
    return { error: RELAY_NOT_FOUND_ERROR };
  }
  if (matches.rows.length > 1) {
    return { error: RELAY_AMBIGUOUS_ERROR };
  }
  return { phone: matches.rows[0].digits };
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
