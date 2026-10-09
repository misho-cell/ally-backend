import { Router, Request, Response } from 'express';
import { authenticateJwt, requireUserRole } from '../middleware/auth.middleware';
import { rateLimit } from '../middleware/rateLimit.middleware';
import { assistantStatus } from '../../services/assistantStatus.service';

/**
 * D699 — the „online" dot.
 *
 *   GET /status/assistant   { state: answering | not_answering | unknown, since, checked_at }
 *
 * The app polls it every few minutes; it reads two rows and spends nothing.
 */
const REQUESTS_PER_MINUTE = 20;

const statusRouter = Router();
statusRouter.use(authenticateJwt, requireUserRole);
statusRouter.use(rateLimit({ windowMs: 60_000, max: REQUESTS_PER_MINUTE }));

statusRouter.get('/assistant', async (_req: Request, res: Response): Promise<void> => {
  try {
    res.status(200).json({ success: true, data: await assistantStatus() });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[GET /status/assistant]', (error as Error).message);
    res.status(500).json({ success: false, error: 'Could not read the assistant status' });
  }
});

export default statusRouter;
