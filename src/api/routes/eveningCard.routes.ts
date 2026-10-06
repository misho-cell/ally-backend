import { Router, Request, Response } from 'express';
import { param, validationResult } from 'express-validator';
import {
  authenticateJwt,
  requireUserRole,
  AuthenticatedRequest,
} from '../middleware/auth.middleware';
import { rateLimit } from '../middleware/rateLimit.middleware';
import { currentEveningCard, snoozeEveningCard } from '../../services/eveningCard.service';

/**
 * #1850 — the evening card.
 *
 *   GET  /evening-card              the person's card with questions still waiting, or null
 *   POST /evening-card/:id/snooze   the whole card comes back about two hours from now
 *
 * Each item is an ordinary ask with its own conversation. A tap on an item is
 * sent as a message to `ask_thread_id` (POST /threads/:id/messages) with one
 * of `choices` (yes, no, later) as the content — exactly what the buttons in
 * that conversation send.
 */
const REQUESTS_PER_MINUTE = 30;

const eveningCardRouter = Router();
eveningCardRouter.use(authenticateJwt, requireUserRole);
eveningCardRouter.use(rateLimit({ windowMs: 60_000, max: REQUESTS_PER_MINUTE }));

eveningCardRouter.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = Number((req as AuthenticatedRequest).user.userId);
    res.status(200).json({ success: true, data: { card: await currentEveningCard(userId) } });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[GET /evening-card]', (error as Error).message);
    res.status(500).json({ success: false, error: 'Could not read the evening card' });
  }
});

eveningCardRouter.post(
  '/:id/snooze',
  param('id').isInt({ min: 1 }),
  async (req: Request, res: Response): Promise<void> => {
    if (!validationResult(req).isEmpty()) {
      res.status(400).json({ success: false, error: 'id must be a positive integer' });
      return;
    }
    try {
      const userId = Number((req as AuthenticatedRequest).user.userId);
      const dueAt = await snoozeEveningCard(userId, Number(req.params.id));
      if (dueAt === null) {
        res.status(404).json({ success: false, error: 'Evening card not found' });
        return;
      }
      res.status(200).json({ success: true, data: { due_at: dueAt.toISOString() } });
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('[POST /evening-card/:id/snooze]', (error as Error).message);
      res.status(500).json({ success: false, error: 'Could not snooze the evening card' });
    }
  },
);

export default eveningCardRouter;
