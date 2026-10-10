import { Router, Request, Response } from 'express';
import {
  authenticateJwt,
  requireUserRole,
  AuthenticatedRequest,
} from '../middleware/auth.middleware';
import { rateLimit } from '../middleware/rateLimit.middleware';
import { connectorState } from '../../services/connectorState.service';

/**
 * The frontend's 06:30Z item 8 (onboarding B8):
 *   GET /connector/state   { connected, last_seen_at } — the person's own Claude connector
 */
const REQUESTS_PER_MINUTE = 30;

const connectorRouter = Router();
connectorRouter.use(authenticateJwt, requireUserRole);
connectorRouter.use(rateLimit({ windowMs: 60_000, max: REQUESTS_PER_MINUTE }));

connectorRouter.get('/state', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = Number((req as AuthenticatedRequest).user.userId);
    res.status(200).json({ success: true, data: await connectorState(userId) });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[GET /connector/state]', (error as Error).message);
    res.status(500).json({ success: false, error: 'Could not read the connector state' });
  }
});

export default connectorRouter;
