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
import {
  MemberIntroRefusal,
  requestIntroToMember,
} from '../../services/memberIntroRequest.service';

/**
 * The frontend's 06:30Z item 9 (§127), keyed by the sealed id the contacts list
 * already carries:
 *   GET /members/:id   the member card — name, role · company, city, areas, open_to
 *   GET /paths/:id     the maps from the owner to that person (task 1849, stage one; sends nothing)
 *   POST /members/:id/intro-request {goal_id?}   4621: asks the first friend on the path for the introduction
 */
const CARDS_PER_MINUTE = 60;
const PATHS_PER_MINUTE = 10;
/** An introduction request reaches a real person; a burst of taps is not an owner deciding. */
const INTRO_REQUESTS_PER_MINUTE = 5;

/** The status each refusal answers with; the frontend words it. */
const REFUSAL_STATUS: Readonly<Record<MemberIntroRefusal, number>> = {
  [MemberIntroRefusal.NoSuchPerson]: 404,
  [MemberIntroRefusal.NoSuchGoal]: 404,
  [MemberIntroRefusal.NoBridgeOnNetai]: 409,
  [MemberIntroRefusal.NotSent]: 409,
};

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

membersRouter.post(
  '/:id/intro-request',
  rateLimit({ windowMs: 60_000, max: INTRO_REQUESTS_PER_MINUTE }),
  async (req: Request, res: Response): Promise<void> => {
    const rawGoal = (req.body as { goal_id?: unknown } | undefined)?.goal_id;
    const goalId = rawGoal === undefined || rawGoal === null ? undefined : Number(rawGoal);
    if (goalId !== undefined && (!Number.isInteger(goalId) || goalId <= 0)) {
      res.status(400).json({ success: false, error: 'goal_id must be a positive integer' });
      return;
    }
    try {
      const userId = Number((req as AuthenticatedRequest).user.userId);
      const outcome = await requestIntroToMember(userId, String(req.params.id), goalId);
      if (!outcome.ok) {
        res
          .status(REFUSAL_STATUS[outcome.refusal])
          .json({ success: false, error: outcome.refusal });
        return;
      }
      res.status(201).json({
        success: true,
        data: { request_id: outcome.requestId, thread_id: outcome.threadId },
      });
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('[POST /members/:id/intro-request]', (error as Error).message);
      res.status(500).json({ success: false, error: 'Could not send the request' });
    }
  },
);

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
