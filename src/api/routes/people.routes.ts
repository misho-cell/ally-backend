import { Router, Request, Response } from 'express';
import {
  authenticateJwt,
  requireUserRole,
  AuthenticatedRequest,
} from '../middleware/auth.middleware';
import { rateLimit } from '../middleware/rateLimit.middleware';
import { requireSubscription } from '../middleware/subscription.middleware';
import { memberCardFor } from '../../services/memberCard.service';
import { chainMapsFor } from '../../services/chainMap.service';

/**
 * The frontend's 06:30Z item 9 (§127), keyed by the sealed id the contacts list
 * already carries:
 *   GET /members/:id   the member card — name, role · company, city, areas, open_to
 *   GET /paths/:id     the maps from the owner to that person (task 1849, stage one; sends nothing)
 */
const CARDS_PER_MINUTE = 60;
const PATHS_PER_MINUTE = 10;

export const membersRouter = Router();
membersRouter.use(authenticateJwt, requireUserRole, requireSubscription);
membersRouter.use(rateLimit({ windowMs: 60_000, max: CARDS_PER_MINUTE }));

membersRouter.get('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = Number((req as AuthenticatedRequest).user.userId);
    const card = await memberCardFor(userId, String(req.params.id));
    if (card === null) {
      res.status(404).json({ success: false, error: 'No such member' });
      return;
    }
    res.status(200).json({ success: true, data: card });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[GET /members/:id]', (error as Error).message);
    res.status(500).json({ success: false, error: 'Could not read the member' });
  }
});

export const pathsRouter = Router();
pathsRouter.use(authenticateJwt, requireUserRole, requireSubscription);
pathsRouter.use(rateLimit({ windowMs: 60_000, max: PATHS_PER_MINUTE }));

pathsRouter.get('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = Number((req as AuthenticatedRequest).user.userId);
    const maps = await chainMapsFor(userId, String(req.params.id));
    if (maps === null) {
      res.status(404).json({ success: false, error: 'No such person' });
      return;
    }
    res.status(200).json({ success: true, data: { paths: maps } });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[GET /paths/:id]', (error as Error).message);
    res.status(500).json({ success: false, error: 'Could not read the paths' });
  }
});
