import { Router, Request, Response, NextFunction } from 'express';
import { param, body, validationResult } from 'express-validator';
import { authenticateJwt, AuthenticatedRequest } from '../middleware/auth.middleware';
import {
  getThreadsForUser,
  createThread,
  getThread,
  getThreadMessages,
  updateThreadTitle,
} from '../../services/threads.service';
import { processChat } from '../../services/chat.service';
import { subscribeUserEvents, emitThreadCreated } from '../../services/sse.service';
import { ApiResponse } from '../../types';

const threadsRouter = Router();

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

threadsRouter.get('/', authenticateJwt, async (req: Request, res: Response): Promise<void> => {
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

threadsRouter.get('/stream', authenticateJwt, (req: Request, res: Response): void => {
  const userId = (req as AuthenticatedRequest).user.userId;
  const cleanup = subscribeUserEvents(userId, res);
  req.on('close', cleanup);
});

threadsRouter.post('/', authenticateJwt, async (req: Request, res: Response): Promise<void> => {
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
  authenticateJwt,
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
  authenticateJwt,
  param('id').isInt({ min: 1 }).withMessage('id must be a positive integer'),
  body('message')
    .isString()
    .trim()
    .notEmpty()
    .isLength({ max: 2000 })
    .withMessage('message must be a non-empty string with max 2000 characters'),
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

      const timeout = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('REQUEST_TIMEOUT')), 50_000),
      );

      const result = await Promise.race([processChat(userId, threadId, message), timeout]);

      res.status(200).json({
        success: true,
        reply: result.reply,
        ...(result.options && { options: result.options }),
      });
    } catch (error) {
      const isTimeout = error instanceof Error && error.message === 'REQUEST_TIMEOUT';
      if (!isTimeout) {
        // eslint-disable-next-line no-console
        console.error('[POST /threads/:id/message]', error);
      }
      res.status(isTimeout ? 504 : 500).json({
        success: false,
        error: isTimeout
          ? 'მოძებნას დასჭირდა ძალიან დიდი დრო. სცადეთ უფრო კონკრეტული კითხვით.'
          : 'სერვერის შეცდომა',
      });
    }
  },
);

export default threadsRouter;
