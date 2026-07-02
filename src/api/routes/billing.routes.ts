import { Router, Request, Response } from 'express';
import { authenticateJwt, AuthenticatedRequest } from '../middleware/auth.middleware';
import { createCustomerPortalSession } from '../../services/paddle.service';
import {
  getWalletSummary,
  listTopupPackages,
  TopupPackage,
  WalletSummary,
} from '../../services/tokenWallet.service';
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

billingRouter.get(
  '/tokens',
  async (req: Request, res: Response<ApiResponse<WalletSummary>>): Promise<void> => {
    try {
      const userId = (req as AuthenticatedRequest).user.userId;
      const summary = await getWalletSummary(userId);
      res.status(200).json({ success: true, data: summary });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[GET /billing/tokens]', err);
      res.status(500).json({ success: false, error: 'სერვერის შეცდომა' });
    }
  },
);

billingRouter.get(
  '/topup-packages',
  async (_req: Request, res: Response<ApiResponse<TopupPackage[]>>): Promise<void> => {
    try {
      const packages = await listTopupPackages();
      res.status(200).json({ success: true, data: packages });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[GET /billing/topup-packages]', err);
      res.status(500).json({ success: false, error: 'სერვერის შეცდომა' });
    }
  },
);

export default billingRouter;
