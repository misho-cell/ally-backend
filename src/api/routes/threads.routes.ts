import { Router, Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';
import { param, body, validationResult } from 'express-validator';
import {
  authenticateJwt,
  requireUserRole,
  AuthenticatedRequest,
} from '../middleware/auth.middleware';
import { requireSubscription } from '../middleware/subscription.middleware';
import { rateLimit } from '../middleware/rateLimit.middleware';
import { captureDeviceFingerprint } from '../middleware/deviceFingerprint.middleware';
import {
  getThreadsForUser,
  createThread,
  getThread,
  getThreadMessages,
  updateThreadTitle,
  saveThreadMessage,
  getLongestRunStep,
  DEFAULT_NEW_THREAD_TITLE,
} from '../../services/threads.service';
import { processChat, ChatResult } from '../../services/chat.service';
import { setThreadStatus, endsWithQuestion } from '../../services/threadStatus.service';
import {
  recordAskAnswerWithRetry,
  buildAnswerWakeEvent,
  markAskWakeDelivered,
  hasPendingAskForThread,
  cancelAsksForTask,
} from '../../services/taskAsks.service';
import { wakeTask } from '../../services/taskEngine.service';
import { hasPendingIntroForThread } from '../../services/introduction.service';
import { generateThreadTitle } from '../../services/threadTitle.service';
import { sweepFactsFromExchange } from '../../services/factExtraction.service';
import { ThreadStatus, deleteThread } from '../../services/threads.service';
import { query } from '../../db/postgres/client';
import { checkRunAllowance } from '../../services/tokenWallet.service';
import {
  subscribeUserEvents,
  emitThreadCreated,
  emitThreadUpdated,
  emitRunComplete,
  emitRunError,
  hasActiveConnection,
} from '../../services/sse.service';
import { sendPushNotification } from '../../services/notification.service';
import { scrubText } from '../../services/privacyScrub';
import { RUN_STRINGS, detectRunLanguage } from '../../services/runLanguage';
import { ApiResponse } from '../../types';

const threadsRouter = Router();

// Ceiling on a single background run — from the shared budget family, so
// raising the wall clock via env raises this with it (see config/runBudgets).
import { RUN_HARD_TIMEOUT_MS } from '../../config/runBudgets';

// A timed-out run's longest persisted step must be at least this long to be
// worth flushing as a partial answer (anything shorter is spinner narration).
const MIN_PARTIAL_FLUSH_CHARS = 80;

// The provisional (pre-generator) title keeps only the message's first words.
const PROVISIONAL_TITLE_WORDS = 6;

// Short, phone-safe preview for the push body. Scrub first (the reply is already
// scrubbed for SSE, but this path is independent), collapse whitespace, truncate.
const PUSH_PREVIEW_MAX_CHARS = 120;
function buildPushPreview(reply: string): string {
  const safe = scrubText(reply).replace(/\s+/g, ' ').trim();
  if (safe.length === 0) return 'შენი პასუხი მზადაა';
  return safe.length > PUSH_PREVIEW_MAX_CHARS
    ? safe.slice(0, PUSH_PREVIEW_MAX_CHARS - 1).trimEnd() + '…'
    : safe;
}

/**
 * Terminal thread status for a finished run: an in-flight introduction request
 * outranks everything (the thread is genuinely waiting on a third party), then
 * an explicit or trailing question to the user, else the run is simply done.
 *
 * `pendingAsk` carries the same truth from the ask engine: a thread whose
 * question is sitting unanswered on someone else's phone is WAITING, whatever
 * the reply text looked like. Without it thread 8416 — the dentist question to
 * Lika, unanswered — was filed as finished and sank to the bottom of the list
 * (ticket 4 item 0C.5).
 */
function statusAfterRun(result: ChatResult, pendingAsk: boolean): ThreadStatus {
  if (result.requestCreated === true) return 'waiting';
  // Third-party dependency outranks the reply's own shape: while an ask or an
  // introduction sits unanswered on someone else's phone the user owes
  // nothing, however chatty the acknowledgement was (ticket 6 B2: thread 8556
  // stayed needs_you because its reply ended with a question).
  if (pendingAsk) return 'waiting';
  if (result.options || result.choices || endsWithQuestion(result.reply)) return 'needs_you';
  return 'done';
}

threadsRouter.use(authenticateJwt, requireUserRole);
threadsRouter.use(requireSubscription);
// Per-user cap on chat/thread traffic (abuse control). A rejected SEND leaves
// a visible error row — thread 9873 sat empty forever after a 429 while the
// user's message painted optimistically (task 38).
const MESSAGE_PATH_RE = /^\/(\d+)\/message$/;
threadsRouter.use(
  rateLimit({
    windowMs: 60_000,
    max: 60,
    onLimit: (req) => {
      if (req.method !== 'POST') return;
      const match = MESSAGE_PATH_RE.exec(req.path);
      if (!match) return;
      const userId = (req as AuthenticatedRequest).user?.userId;
      if (!userId) return;
      void saveThreadMessage(
        Number(match[1]),
        Number(userId),
        'assistant',
        'შეტყობინება ვერ მივიღე — ძალიან ბევრი ზედიზედ. ერთ წუთში ისევ სცადე.',
        'error',
      ).catch(() => undefined);
    },
  }),
);
threadsRouter.use(captureDeviceFingerprint);

function handleValidationErrors(
  req: Request,
  res: Response<ApiResponse<unknown>>,
  next: NextFunction,
): void {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const message = errors
      .array()
      .map((err) => err.msg)
      .join(', ');
    res.status(400).json({ success: false, error: message });
    return;
  }
  next();
}

threadsRouter.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as AuthenticatedRequest).user.userId;
    // Optional paging — omitted, the response is exactly what it always was, so
    // no client breaks. A client that passes ?limit= gets a page and walks back
    // with ?before=<last updated_at>&before_id=<last id>.
    const rawLimit = Number(req.query.limit);
    const before = typeof req.query.before === 'string' ? req.query.before : undefined;
    const rawBeforeId = Number(req.query.before_id);
    const threads = await getThreadsForUser(userId, {
      ...(Number.isFinite(rawLimit) && rawLimit > 0 && { limit: Math.floor(rawLimit) }),
      ...(before && { beforeUpdatedAt: before }),
      ...(Number.isFinite(rawBeforeId) && rawBeforeId > 0 && { beforeId: Math.floor(rawBeforeId) }),
    });
    res.status(200).json({ success: true, data: threads });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[GET /threads]', error);
    const message = error instanceof Error ? error.message : 'Failed to fetch threads';
    res.status(500).json({ success: false, error: message });
  }
});

threadsRouter.get('/stream', (req: Request, res: Response): void => {
  const userId = (req as AuthenticatedRequest).user.userId;
  const cleanup = subscribeUserEvents(userId, res);
  req.on('close', cleanup);
});

threadsRouter.post('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as AuthenticatedRequest).user.userId;
    const thread = await createThread(userId, 'regular');
    emitThreadCreated(userId, {
      id: thread.id,
      type: thread.type,
      title: thread.title,
      is_task: thread.is_task,
      status: thread.status,
      status_line: thread.status_line,
    });
    res.status(201).json({ success: true, data: thread });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[POST /threads]', error);
    const message = error instanceof Error ? error.message : 'Failed to create thread';
    res.status(500).json({ success: false, error: message });
  }
});

threadsRouter.get(
  '/:id/messages',
  param('id').isInt({ min: 1 }).withMessage('id must be a positive integer'),
  handleValidationErrors,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = (req as AuthenticatedRequest).user.userId;
      const threadId = Number(req.params.id);

      const thread = await getThread(threadId, userId);
      if (thread === null) {
        res.status(404).json({ success: false, error: 'Thread not found' });
        return;
      }

      // Optional paging — omitted, the whole history comes back exactly as
      // before. ?limit=30 opens the chat on its most recent 30 messages; the
      // client loads older ones by passing the oldest row it holds as the
      // cursor (?before=<created_at>&before_id=<id>).
      const rawLimit = Number(req.query.limit);
      const before = typeof req.query.before === 'string' ? req.query.before : undefined;
      // A UUID string on prod — passed through verbatim, never parsed.
      const beforeId = typeof req.query.before_id === 'string' ? req.query.before_id : undefined;
      const messages = await getThreadMessages(threadId, {
        ...(Number.isFinite(rawLimit) && rawLimit > 0 && { limit: Math.floor(rawLimit) }),
        ...(before && { beforeCreatedAt: before }),
        ...(beforeId && { beforeId }),
      });
      res.status(200).json({ success: true, data: messages });
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('[GET /threads/:id/messages]', error);
      const message = error instanceof Error ? error.message : 'Failed to fetch messages';
      res.status(500).json({ success: false, error: message });
    }
  },
);

threadsRouter.post(
  '/:id/message',
  param('id').isInt({ min: 1 }).withMessage('id must be a positive integer'),
  body('message')
    .isString()
    .trim()
    .notEmpty()
    .isLength({ max: 10000 })
    .withMessage('შეტყობინება ძალიან გრძელია — გთხოვ, დაამოკლე (მაქს. 10000 სიმბოლო).'),
  handleValidationErrors,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = (req as AuthenticatedRequest).user.userId;
      const threadId = Number(req.params.id);
      const { message } = req.body as { message: string };

      const thread = await getThread(threadId, userId);
      if (thread === null) {
        res.status(404).json({ success: false, error: 'Thread not found' });
        return;
      }

      // Provisional title immediately (never a blank row in the chat list);
      // the model-written title is generated AFTER the run, from the FINAL
      // reply (ticket 6 close, task 20: draft-time titles echoed the opener
      // the strip was about to remove and contradicted their own answers).
      const needsTitle =
        thread.type === 'regular' &&
        (thread.title === null || thread.title === DEFAULT_NEW_THREAD_TITLE);
      if (needsTitle) {
        const provisional = message.split(/\s+/).slice(0, PROVISIONAL_TITLE_WORDS).join(' ');
        await updateThreadTitle(threadId, provisional.slice(0, MAX_TITLE_CHARS));
      }

      // Token wallet gate: when enabled, an exhausted balance blocks new runs
      // (the in-flight one always completes). 402 carries a machine reason so
      // the app can show the right screen.
      const allowance = await checkRunAllowance(userId);
      if (!allowance.allowed) {
        res.status(402).json({
          success: false,
          error: 'ტოკენები ამოგეწურა — შეიძინე დამატებით ან დაელოდე თვიურ განახლებას',
          reason: 'insufficient_tokens',
          balance: allowance.balance,
        });
        return;
      }

      // Accept the message and process it in the background. The agent loop can
      // take minutes for large multi-step tasks, so we never hold the HTTP
      // request open: progress and the final answer are streamed over SSE
      // (GET /threads/stream), keyed by runId.
      const runId = randomUUID();
      res.status(202).json({ success: true, runId });

      // An incoming_ask thread is someone ELSE's question — the reply is the
      // answer. Capture it onto the ask and wake the asking task; this thread's
      // own run still proceeds normally (the assistant acknowledges). The
      // capture result is kept: an answered ask must end the run as 'done'
      // whatever the run itself does (ticket 3 §6.11 — rows stayed red because
      // the acknowledgement's trailing question flipped the status back to
      // needs_you).
      let askAnswerCaptured: Promise<boolean> = Promise.resolve(false);
      if (thread.type === 'incoming_ask') {
        // Retried capture + delivery marker (ticket 4 blocker 1): a deploy-
        // window failure dropped 3 of 7 wakes on 11 Aug. The wake is marked
        // delivered only after it actually ran; the task-engine sweep
        // re-delivers anything still unmarked within minutes.
        askAnswerCaptured = recordAskAnswerWithRetry(threadId, message)
          .then((captured) => {
            if (captured?.firstAnswer) {
              // The verbatim (scrubbed) answer rides IN the wake event, tag-
              // delimited so quotes inside the answer can't break it (ticket 3
              // §5; ticket 4 blocker 3).
              void wakeTask(
                captured.taskId,
                buildAnswerWakeEvent(captured.answer, captured.fromName),
                { text: captured.answer, who: captured.fromName },
              )
                .then((delivered) => (delivered ? markAskWakeDelivered(captured.askId) : undefined))
                .catch((err: unknown) =>
                  // eslint-disable-next-line no-console
                  console.error('[ask-wake] failed (sweep will retry):', (err as Error).message),
                );
            }
            return captured !== null;
          })
          .catch((err: unknown) => {
            // eslint-disable-next-line no-console
            console.error('[ask-capture] failed:', (err as Error).message);
            return false;
          });
      }

      // The run is in flight — every device's chat list shows "working" from
      // the server-held state (no more client-local status guessing). The
      // caption follows the message's language (22(h)'s in-progress half: an
      // English thread read „ვმუშაობ…" for the whole run, tester 22 Aug).
      void setThreadStatus(userId, threadId, 'working', {
        statusLine: RUN_STRINGS[detectRunLanguage(message)].statusLines.working,
      });

      // Hard outer timeout: the run's own budget (~90s) normally forces a final
      // answer, but a truly stuck call (a hung external dependency the inner
      // watchdogs miss) could otherwise leave the client waiting forever with the
      // input locked — which cost us a tester. If the run hasn't produced a reply
      // by this ceiling, surface a visible, retryable error instead of silence.
      // (The orphaned run may still finish; the race has already settled, so its
      // late result is ignored and never double-emitted.)
      const hardTimeout = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('RUN_HARD_TIMEOUT')), RUN_HARD_TIMEOUT_MS),
      );
      Promise.race([processChat(userId, threadId, message, runId), hardTimeout])
        .then(async (result) => {
          // The recipient's answer was already delivered by the capture above —
          // the row is 'done' no matter how this run ends. In the 10 Aug live
          // test the run's failure text told the recipient the answer had
          // failed while the asker already had it (ticket 3 §1 case 2 / §6.5).
          const answered = await askAnswerCaptured;
          // Waiting covers BOTH kinds of third-party dependency: an unanswered
          // ask AND an unanswered introduction request (ticket 5 item B2).
          const pendingIntro =
            thread.type === 'outgoing_request' &&
            (await hasPendingIntroForThread(thread.introduction_request_id).catch(() => false));
          // The run itself reports failure (e.g. an empty final) — surface a
          // retryable error, never a "successful" empty answer.
          if (result.runFailed === true) {
            emitRunError(userId, threadId, runId, result.reply);
            void setThreadStatus(userId, threadId, answered ? 'done' : 'failed');
            return;
          }
          emitRunComplete(userId, threadId, runId, {
            reply: result.reply,
            ...(result.options && { options: result.options }),
            ...(result.choices && { choices: result.choices }),
            ...(result.taskResult && { result: result.taskResult }),
          });
          // Title from the FINAL, post-strip reply (task 20) — never from a draft.
          if (needsTitle) void generateThreadTitle(userId, threadId, message, result.reply);
          // Engine T1: catches facts about named third parties the live
          // assistant decided not to save mid-conversation.
          void sweepFactsFromExchange(userId, threadId, message, result.reply);
          // Persist + broadcast the terminal status. The thread becomes a task
          // once a run sent a request or reported a structured result.
          const becameTask = result.requestCreated === true || result.taskResult !== undefined;
          const pendingAsk =
            (await hasPendingAskForThread(threadId).catch(() => false)) || pendingIntro;
          const finalStatus = answered ? 'done' : statusAfterRun(result, pendingAsk);
          // The status caption follows the conversation's language (task 22
          // g/h) — an English thread must not read „შენი პასუხი სჭირდება".
          const lang = result.language ?? 'ka';
          const langLine =
            finalStatus === 'done' ? null : RUN_STRINGS[lang].statusLines[finalStatus];
          void setThreadStatus(userId, threadId, finalStatus, {
            statusLine: langLine,
            ...(becameTask && { isTask: true }),
          });
          // If the user isn't connected (closed the app / switched away), their
          // answer would sit unseen — push it. No-op when they're live (they see
          // it over SSE) or when VAPID isn't configured. The preview is scrubbed
          // and truncated so no phone number rides in the notification body.
          if (!hasActiveConnection(userId)) {
            void sendPushNotification(userId, {
              title: 'Netai — პასუხი მზადაა',
              body: buildPushPreview(result.reply),
              url: `/chat/${threadId}`,
            }).catch(() => undefined);
          }
        })
        .catch(async (error: unknown) => {
          const timedOut = error instanceof Error && error.message === 'RUN_HARD_TIMEOUT';
          // eslint-disable-next-line no-console
          console.error('[POST /threads/:id/message] run failed', error);

          // The answer was already captured and relayed — the thread's only
          // job is done. A "retry" here would read as "your answer failed"
          // (it did not) and invite a duplicate answer (ticket 3 §1 case 2).
          if (await askAnswerCaptured) {
            const reply = 'პასუხი გადაცემულია — მადლობა!';
            emitRunComplete(userId, threadId, runId, { reply });
            void setThreadStatus(userId, threadId, 'done');
            saveThreadMessage(threadId, Number(userId), 'assistant', reply).catch(() => undefined);
            return;
          }

          // Timeout with material already gathered → FLUSH it as a partial
          // answer instead of a bare error ("on timeout, deliver what was
          // found + ask გავაგრძელო?" — the spec from the battery runs where
          // the right answer sat in a step while the run died).
          if (timedOut) {
            const partial = await getLongestRunStep(threadId, runId).catch(() => null);
            if (partial !== null && partial.length >= MIN_PARTIAL_FLUSH_CHARS) {
              const reply = `${partial}\n\nამაზე მეტი ვერ მოვასწარი — გავაგრძელო?`;
              emitRunComplete(userId, threadId, runId, { reply });
              void setThreadStatus(userId, threadId, 'needs_you');
              saveThreadMessage(threadId, Number(userId), 'assistant', reply).catch(
                () => undefined,
              );
              return;
            }
          }

          const userMessage = timedOut
            ? 'პასუხის მომზადებას ძალიან დიდი დრო დასჭირდა. გთხოვ, სცადე თავიდან.'
            : 'ტექნიკური შეფერხება მოხდა ჩვენს მხარეს. გთხოვ, სცადე თავიდან.';
          emitRunError(userId, threadId, runId, userMessage);
          void setThreadStatus(userId, threadId, 'failed');
          // The SSE event alone is not enough: if the stream dropped mid-run, the
          // user stares at frozen narration forever (three real stalls in one
          // battery run showed no visible timeout). Persist the error INTO the
          // thread — kind='error' so the client renders it as a system failure
          // with a retry, never as words the assistant said. Best-effort.
          saveThreadMessage(threadId, Number(userId), 'assistant', userMessage, 'error').catch(
            () => undefined,
          );
        });
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('[POST /threads/:id/message]', error);
      if (!res.headersSent) {
        res.status(500).json({ success: false, error: 'სერვერის შეცდომა' });
      }
    }
  },
);

// Rename a conversation (Lika's item 1). The user's own words become the
// title verbatim (trimmed and capped); a rename also wins over any later
// model-generated title, because generateThreadTitle only fires on creation.
const MAX_TITLE_CHARS = 80;
threadsRouter.patch(
  '/:id',
  param('id').isInt({ min: 1 }),
  body('title').isString().trim().isLength({ min: 1, max: MAX_TITLE_CHARS }),
  async (req: Request, res: Response<ApiResponse<unknown>>): Promise<void> => {
    if (!validationResult(req).isEmpty()) {
      res.status(400).json({ success: false, error: `title: 1–${MAX_TITLE_CHARS} სიმბოლო` });
      return;
    }
    try {
      const userId = (req as AuthenticatedRequest).user.userId;
      const threadId = Number(req.params.id);
      const thread = await getThread(threadId, userId);
      if (thread === null) {
        res.status(404).json({ success: false, error: 'საუბარი ვერ მოიძებნა' });
        return;
      }
      const title = String((req.body as { title: string }).title).trim();
      await updateThreadTitle(threadId, title);
      emitThreadUpdated(userId, { id: threadId, title });
      res.status(200).json({ success: true, data: { id: threadId, title } });
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('[PATCH /threads/:id]', error);
      res.status(500).json({ success: false, error: 'გადარქმევა ვერ მოხერხდა' });
    }
  },
);

// Delete one conversation (Lika's D23) — pending asks of any task living on
// the thread are cancelled FIRST (recipients get an honest closing note),
// then the thread and everything in it goes in one transaction.
threadsRouter.delete(
  '/:id',
  param('id').isInt({ min: 1 }),
  async (req: Request, res: Response<ApiResponse<unknown>>): Promise<void> => {
    if (!validationResult(req).isEmpty()) {
      res.status(400).json({ success: false, error: 'არასწორი thread id' });
      return;
    }
    try {
      const userId = (req as AuthenticatedRequest).user.userId;
      const threadId = Number(req.params.id);
      const thread = await getThread(threadId, userId);
      if (thread === null) {
        res.status(404).json({ success: false, error: 'საუბარი ვერ მოიძებნა' });
        return;
      }
      // tasks.user_id is TEXT — uncast parameter (the ::int cast was one of the
      // three faults behind ticket 5 item A2's 500).
      const openTasks = await query<{ id: number }>(
        `SELECT id FROM tasks WHERE thread_id = $1 AND user_id = $2 AND status = 'open'`,
        [threadId, userId],
      );
      for (const task of openTasks.rows) {
        await cancelAsksForTask(task.id).catch(() => undefined);
      }
      const result = await deleteThread(userId, threadId);
      if (!result.deleted) {
        res.status(404).json({ success: false, error: 'საუბარი ვერ მოიძებნა' });
        return;
      }
      res.status(200).json({ success: true, data: result });
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('[DELETE /threads/:id]', error);
      res.status(500).json({ success: false, error: 'წაშლა ვერ მოხერხდა' });
    }
  },
);

export default threadsRouter;
