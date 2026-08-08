import { query } from '../db/postgres/client';
import { createThread, saveThreadMessage } from './threads.service';
import { emitThreadCreated } from './sse.service';
import { sendPushNotification } from './notification.service';
import { scrubText } from './privacyScrub';

const ASK_QUERY_TIMEOUT_MS = 8_000;
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

  // Live-fire safety switch for the incoming_ask test phase: when set (comma-
  // separated user ids), asks may reach ONLY those accounts — a mis-picked
  // contact must not receive a test question about someone else's problem.
  // Unset (the default) = no restriction.
  const allowlist = (process.env.ASK_RECIPIENT_ALLOWLIST ?? '')
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
  if (allowlist.length > 0 && !allowlist.includes(String(toUserId))) {
    return {
      sent: false,
      error: 'სატესტო რეჟიმშია: შეკითხვები ამ ეტაპზე მხოლოდ თანხმობის მქონე მიმღებებთან იგზავნება.',
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
  const senderName = fromName.rows[0]?.name ?? 'Netai-ს მომხმარებელი';

  // Recipient-side thread: born a task-shaped item awaiting THEIR reply. The
  // question crosses accounts — scrub it.
  const safeQuestion = scrubText(trimmed);
  const thread = await createThread(
    String(toUserId),
    'incoming_ask',
    `${senderName} — კითხვა`,
    undefined,
    {
      isTask: true,
      status: 'needs_you',
      statusLine: 'პასუხს ელოდება',
    },
  );
  const opening =
    `**${senderName}**-ის ასისტენტი გეკითხება:\n\n"${safeQuestion}"\n\n` +
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
export async function recordAskAnswer(
  askThreadId: number,
  answerText: string,
): Promise<{ taskId: number; firstAnswer: boolean } | null> {
  const safe = scrubText(answerText.trim());
  if (!safe) return null;
  const updated = await query<{ task_id: number; status: string }>(
    `UPDATE task_asks
     SET answer = CASE WHEN answer IS NULL THEN $2 ELSE answer || E'\n' || $2 END,
         status = CASE WHEN status = 'sent' THEN 'answered' ELSE status END,
         answered_at = COALESCE(answered_at, NOW())
     WHERE ask_thread_id = $1 AND status IN ('sent', 'answered')
     RETURNING task_id, status`,
    [askThreadId, safe],
    ASK_QUERY_TIMEOUT_MS,
  );
  const row = updated.rows[0];
  if (!row) return null;
  // firstAnswer = the transition happened in THIS update: answered_at was just
  // set. Detect via a second cheap read of answer history length? Simpler: the
  // status was 'sent' before when answered_at IS NOW — approximate by checking
  // whether the stored answer equals exactly this message.
  const check = await query<{ answer: string }>(
    `SELECT answer FROM task_asks WHERE ask_thread_id = $1 LIMIT 1`,
    [askThreadId],
    ASK_QUERY_TIMEOUT_MS,
  );
  const firstAnswer = (check.rows[0]?.answer ?? '') === safe;
  return { taskId: row.task_id, firstAnswer };
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

/**
 * Relay: the RECIPIENT of an ask forwards it (with their consent, voiced in
 * their own thread) to one of THEIR contacts. The child ask keeps the original
 * task_id, so C's answer wakes A's task through the normal capture path; B is
 * the sender for caps and dedupe purposes. One level deep by design.
 */
export async function createRelayAsk(
  relayerUserId: string,
  parentAskId: number,
  contactPhone: string,
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
  return createAsk(
    relayerUserId,
    row.task_id,
    contactPhone,
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
