import { Router, Request, Response } from 'express';
import { authenticateJwt, AuthenticatedRequest } from '../middleware/auth.middleware';
import { createCustomerPortalSession } from '../../services/paddle.service';
import { ApiResponse } from '../../types';

const billingRouter = Router();

billingRouter.use(authenticateJwt);

billingRouter.post(
  '/customer-portal',
  async (req: Request, res: Response<ApiResponse<{ url: string }>>): Promise<void> => {
    try {
      const userId = (req as AuthenticatedRequest).user.userId;
      const url = await createCustomerPortalSession(userId);
      res.status(200).json({ success: true, data: { url } });
    } catch (err) {
      const message = err instanceof Error ? err.message : '';
      if (message === 'no_active_subscription') {
        res.status(404).json({ success: false, error: 'აქტიური გამოწერა ვერ მოიძებნა' });
        return;
      }
      // eslint-disable-next-line no-console
      console.error('[POST /billing/customer-portal]', err);
      res.status(500).json({ success: false, error: 'სერვერის შეცდომა' });
    }
  },
);

export default billingRouter;
