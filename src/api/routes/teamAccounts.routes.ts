import { Router, Request, Response } from 'express';
import { body, param, validationResult } from 'express-validator';
import {
  AuthenticatedRequest,
  authenticateJwt,
  requireAdminRole,
} from '../middleware/auth.middleware';
import { ApiResponse } from '../../types';
import {
  listTeamAccounts,
  setTeamAccountExcluded,
  TeamAccountExclusion,
} from '../../services/excludedHolders.service';
import { recordProductEvent } from '../../services/productEvents.service';

/**
 * #8623 (DR10): mark a Netai team member's own account as one that is never a
 * route (never a bridge, a path link or a reverse-tie holder). Mounted inside
 * the admin router, and carries the admin guard itself too. Who is on the
 * team is set here by Misho or ops — never written into git.
 *
 *   GET /admin/team-accounts              → { user_ids: number[] }
 *   PUT /admin/team-accounts/:userId      { excluded: true | false }
 */

const SERVER_ERROR = 'სერვერის შეცდომა';
const BAD_INPUT = 'userId must be a positive integer and excluded must be true or false';

interface TeamAccountsList {
  readonly user_ids: readonly number[];
}

interface TeamAccountChange {
  readonly user_id: number;
  readonly outcome: TeamAccountExclusion;
}

/** What each refusal is answered with; anything else is a success. */
const REFUSALS: Readonly<Partial<Record<TeamAccountExclusion, { status: number; error: string }>>> =
  {
    [TeamAccountExclusion.NoSuchUser]: { status: 404, error: 'No account with this id.' },
    [TeamAccountExclusion.ExcludedForAnotherReason]: {
      status: 409,
      error: 'This account is already never a route for another reason; it was left as it is.',
    },
    [TeamAccountExclusion.NotATeamAccount]: {
      status: 404,
      error: 'This account is not marked as a team account.',
    },
  };

export const teamAccountsRouter = Router();
teamAccountsRouter.use(authenticateJwt, requireAdminRole);

teamAccountsRouter.get('/', async (_req: Request, res: Response<ApiResponse<TeamAccountsList>>) => {
  try {
    const userIds = await listTeamAccounts();
    res.status(200).json({ success: true, data: { user_ids: userIds } });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[team-accounts] list:', (error as Error).message);
    res.status(500).json({ success: false, error: SERVER_ERROR });
  }
});

teamAccountsRouter.put(
  '/:userId',
  param('userId').isInt({ min: 1 }),
  body('excluded').isBoolean({ strict: true }),
  async (req: Request, res: Response<ApiResponse<TeamAccountChange>>) => {
    if (!validationResult(req).isEmpty()) {
      res.status(400).json({ success: false, error: BAD_INPUT });
      return;
    }
    const userId = Number(req.params.userId);
    const excluded = (req.body as { excluded: boolean }).excluded === true;
    try {
      const outcome = await setTeamAccountExcluded(userId, excluded);
      const refusal = REFUSALS[outcome];
      if (refusal !== undefined) {
        res.status(refusal.status).json({ success: false, error: refusal.error });
        return;
      }
      const adminId = (req as AuthenticatedRequest).user.userId;
      void recordProductEvent(adminId, 'team_account_exclusion', {
        target_user_id: userId,
        excluded,
      });
      // eslint-disable-next-line no-console
      console.log(`[team-accounts] admin ${adminId} ${outcome} team account ${userId}`);
      res.status(200).json({ success: true, data: { user_id: userId, outcome } });
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('[team-accounts] change:', (error as Error).message);
      res.status(500).json({ success: false, error: SERVER_ERROR });
    }
  },
);
