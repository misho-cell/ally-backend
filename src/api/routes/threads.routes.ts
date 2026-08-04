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
} from '../../services/threads.service';
import { processChat, ChatResult } from '../../services/chat.service';
import { setThreadStatus, endsWithQuestion } from '../../services/threadStatus.service';
import { recordAskAnswer } from '../../services/taskAsks.service';
import { wakeTask } from '../../services/taskEngine.service';
import { generateThreadTitle } from '../../services/threadTitle.service';
import { ThreadStatus } from '../../services/threads.service';
import { checkRunAllowance } from '../../services/tokenWallet.service';
import {
  subscribeUserEvents,
  emitThreadCreated,
  emitRunComplete,
  emitRunError,
  hasActiveConnection,
} from '../../services/sse.service';
import { sendPushNotification } from '../../services/notification.service';
import { scrubText } from '../../services/privacyScrub';
import { ApiResponse } from '../../types';

const threadsRouter = Router();

// Ceiling on a single background run — from the shared budget family, so
// raising the wall clock via env raises this with it (see config/runBudgets).
import { RUN_HARD_TIMEOUT_MS } from '../../config/runBudgets';

// A timed-out run's longest persisted step must be at least this long to be
// worth flushing as a partial answer (anything shorter is spinner narration).
const MIN_PARTIAL_FLUSH_CHARS = 80;

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
 */
function statusAfterRun(result: ChatResult): ThreadStatus {
  if (result.requestCreated === true) return 'waiting';
  if (result.options || result.choices || endsWithQuestion(result.reply)) return 'needs_you';
  return 'done';
}

threadsRouter.use(authenticateJwt, requireUserRole);
threadsRouter.use(requireSubscription);
// Per-user cap on chat/thread traffic (abuse control).
threadsRouter.use(rateLimit({ windowMs: 60_000, max: 60 }));
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
    const threads = await getThreadsForUser(userId);
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

      const messages = await getThreadMessages(threadId);
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

      if (thread.type === 'regular' && thread.title === null) {
        // Provisional title immediately (never a blank row in the chat list),
        // then a model-written 2–4 word one replaces it via thread_updated.
        await updateThreadTitle(threadId, message.slice(0, 60));
        void generateThreadTitle(userId, threadId, message);
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
      // own run still proceeds normally (the assistant acknowledges).
      if (thread.type === 'incoming_ask') {
        void recordAskAnswer(threadId, message)
          .then((captured) => {
            if (captured?.firstAnswer) {
              void setThreadStatus(userId, threadId, 'done');
              return wakeTask(
                captured.taskId,
                'პასუხი მოვიდა შენს გაგზავნილ კითხვაზე — გაეცანი (კითხვების სექცია) და გააგრძელე დავალება.',
              );
            }
            return undefined;
          })
          .catch((err: unknown) =>
            // eslint-disable-next-line no-console
            console.error('[ask-capture] failed:', (err as Error).message),
          );
      }

      // The run is in flight — every device's chat list shows "working" from
      // the server-held state (no more client-local status guessing).
      void setThreadStatus(userId, threadId, 'working');

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
        .then((result) => {
          // The run itself reports failure (e.g. an empty final) — surface a
          // retryable error, never a "successful" empty answer.
          if (result.runFailed === true) {
            emitRunError(userId, threadId, runId, result.reply);
            void setThreadStatus(userId, threadId, 'failed');
            return;
          }
          emitRunComplete(userId, threadId, runId, {
            reply: result.reply,
            ...(result.options && { options: result.options }),
            ...(result.choices && { choices: result.choices }),
            ...(result.taskResult && { result: result.taskResult }),
          });
          // Persist + broadcast the terminal status. The thread becomes a task
          // once a run sent a request or reported a structured result.
          const becameTask = result.requestCreated === true || result.taskResult !== undefined;
          void setThreadStatus(userId, threadId, statusAfterRun(result), {
            ...(becameTask && { isTask: true }),
          });
          // If the user isn't connected (closed the app / switched away), their
          // answer would sit unseen — push it. No-op when they're live (they see
          // it over SSE) or when VAPID isn't configured. The preview is scrubbed
          // and truncated so no phone number rides in the notification body.
          if (!hasActiveConnection(userId)) {
            void sendPushNotification(userId, {
              title: 'Ally — პასუხი მზადაა',
              body: buildPushPreview(result.reply),
              url: `/chat/${threadId}`,
            }).catch(() => undefined);
          }
        })
        .catch(async (error: unknown) => {
          const timedOut = error instanceof Error && error.message === 'RUN_HARD_TIMEOUT';
          // eslint-disable-next-line no-console
          console.error('[POST /threads/:id/message] run failed', error);

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

export default threadsRouter;
