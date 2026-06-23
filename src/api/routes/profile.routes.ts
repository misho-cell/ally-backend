import { Router, Request, Response } from 'express';
import { authenticateJwt, AuthenticatedRequest } from '../middleware/auth.middleware';
import { query } from '../../db/postgres/client';
import { ApiResponse } from '../../types';

interface ProfileData {
  readonly name: string;
  readonly phone: string | null;
  readonly subscription_tier: string;
  readonly subscription_status: string;
  readonly trial_ends_at: string | null;
  readonly current_period_ends_at: string | null;
}

const profileRouter = Router();

profileRouter.get(
  '/',
  authenticateJwt,
  async (req: Request, res: Response<ApiResponse<ProfileData>>): Promise<void> => {
    try {
      const userId = (req as AuthenticatedRequest).user.userId;

      const result = await query<ProfileData>(
        `SELECT u.name,
                up.phone,
                u.subscription_tier,
                u.subscription_status,
                u.trial_ends_at,
                u.current_period_ends_at
         FROM "User" u
         LEFT JOIN "UserPhone" up ON up."userId" = u.id
         WHERE u.id = $1
         LIMIT 1`,
        [userId],
      );

      const row = result.rows[0];
      if (!row) {
        res.status(404).json({ success: false, error: 'მომხმარებელი ვერ მოიძებნა' });
        return;
      }

      res.status(200).json({ success: true, data: row });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[GET /profile]', err);
      res.status(500).json({ success: false, error: 'სერვერის შეცდომა' });
    }
  },
);

export default profileRouter;
