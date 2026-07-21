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
} from '../../services/threads.service';
import { processChat } from '../../services/chat.service';
import { checkRunAllowance } from '../../services/tokenWallet.service';
import {
  subscribeUserEvents,
  emitThreadCreated,
  emitRunComplete,
  emitRunError,
} from '../../services/sse.service';
import { ApiResponse } from '../../types';

const threadsRouter = Router();

// Ceiling on a single background run. Sits just above the run's own ~90s
// wall-clock budget, so a normal run finishes on its own and this only fires for
// a genuinely stuck run — turning a silent forever-hang into a retryable error.
const RUN_HARD_TIMEOUT_MS = 110_000;

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
    emitThreadCreated(userId, { id: thread.id, type: thread.type, title: thread.title });
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
        await updateThreadTitle(threadId, message.slice(0, 60));
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
          emitRunComplete(userId, threadId, runId, {
            reply: result.reply,
            ...(result.options && { options: result.options }),
            ...(result.choices && { choices: result.choices }),
          });
        })
        .catch((error: unknown) => {
          const timedOut = error instanceof Error && error.message === 'RUN_HARD_TIMEOUT';
          // eslint-disable-next-line no-console
          console.error('[POST /threads/:id/message] run failed', error);
          emitRunError(
            userId,
            threadId,
            runId,
            timedOut ? 'პასუხს ძალიან დიდი დრო დასჭირდა — სცადე თავიდან 🙏' : 'სერვერის შეცდომა',
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
