import { Router, Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';
import { body, param, validationResult } from 'express-validator';
import {
  authenticateJwt,
  requireUserRole,
  AuthenticatedRequest,
} from '../middleware/auth.middleware';
import { requireSubscription } from '../middleware/subscription.middleware';
import { rateLimit } from '../middleware/rateLimit.middleware';
import {
  buildContactInsightSystemPrompt,
  processChat,
  getOrCreateDefaultThread,
} from '../../services/chat.service';
import { getContactInsight, saveContactInsight } from '../../services/insights.service';
import { ApiResponse, ContactInsight } from '../../types';

const chatRouter = Router();

chatRouter.use(authenticateJwt, requireUserRole);
chatRouter.use(requireSubscription);
chatRouter.use(rateLimit({ windowMs: 60_000, max: 60 }));

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

chatRouter.get(
  '/insights/:neo4jContactId',
  param('neo4jContactId').isString().trim().notEmpty().withMessage('neo4jContactId is required'),
  handleValidationErrors,
  async (
    req: Request,
    res: Response<ApiResponse<{ systemPrompt: string; insight: ContactInsight | null }>>,
  ) => {
    try {
      const userId = (req as AuthenticatedRequest).user.userId;
      const neo4jContactId = String(req.params.neo4jContactId);
      const insight = await getContactInsight(userId, neo4jContactId);
      const systemPrompt = await buildContactInsightSystemPrompt();

      res.status(200).json({ success: true, data: { systemPrompt, insight } });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to fetch contact insight';
      res.status(500).json({ success: false, error: message });
    }
  },
);

chatRouter.post(
  '/insights/:neo4jContactId',
  param('neo4jContactId').isString().trim().notEmpty().withMessage('neo4jContactId is required'),
  body('contact_name').isString().trim().notEmpty().withMessage('contact_name is required'),
  body('collected_data')
    .exists()
    .withMessage('collected_data is required')
    .isObject()
    .withMessage('collected_data must be an object'),
  handleValidationErrors,
  async (
    req: Request,
    res: Response<ApiResponse<{ systemPrompt: string; insight: ContactInsight }>>,
  ) => {
    try {
      const userId = (req as AuthenticatedRequest).user.userId;
      const neo4jContactId = String(req.params.neo4jContactId);
      const contactName = String(req.body.contact_name);
      const collectedData = req.body.collected_data as Record<string, unknown>;
      const insight = await saveContactInsight(userId, neo4jContactId, contactName, collectedData);
      const systemPrompt = await buildContactInsightSystemPrompt();

      res.status(200).json({ success: true, data: { systemPrompt, insight } });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to save contact insight';
      res.status(500).json({ success: false, error: message });
    }
  },
);

chatRouter.post(
  '/message',
  body('message').isString().trim().notEmpty().isLength({ max: 10000 }),
  async (req: Request, res: Response) => {
    const errors = validationResult(req);

    if (!errors.isEmpty()) {
      res.status(400).json({ success: false, errors: errors.array() });
      return;
    }

    try {
      const { message } = req.body as { message: string };
      const userId = (req as AuthenticatedRequest).user.userId;

      const threadId = await getOrCreateDefaultThread(userId);

      const timeout = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('REQUEST_TIMEOUT')), 300_000),
      );
      const result = await Promise.race([
        processChat(userId, threadId, message, randomUUID()),
        timeout,
      ]);

      res.status(200).json({
        success: true,
        reply: result.reply,
        ...(result.options && { options: result.options }),
        ...(result.choices && { choices: result.choices }),
      });
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error(error);
      const isTimeout = error instanceof Error && error.message === 'REQUEST_TIMEOUT';
      res.status(isTimeout ? 504 : 500).json({
        success: false,
        error: isTimeout
          ? 'მოძებნას დასჭირდა ძალიან დიდი დრო. სცადეთ უფრო კონკრეტული კითხვით.'
          : 'სერვერის შეცდომა',
      });
    }
  },
);

export default chatRouter;
