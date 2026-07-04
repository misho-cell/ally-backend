import { Router, Request, Response } from 'express';
import {
  authenticateJwt,
  requireUserRole,
  AuthenticatedRequest,
} from '../middleware/auth.middleware';
import { createCustomerPortalSession } from '../../services/paddle.service';
import {
  getReferralSummary,
  ReferralSummary,
  SpendOutcome,
  spendReferralOnSubscription,
  spendReferralOnTokens,
} from '../../services/referral.service';
import {
  getWalletSummary,
  listTopupPackages,
  TopupPackage,
  WalletSummary,
} from '../../services/tokenWallet.service';
import { ApiResponse } from '../../types';

const SPEND_ERRORS: Record<string, { status: number; message: string }> = {
  insufficient_balance: { status: 402, message: 'რეფერალური ბალანსი საკმარისი არ არის' },
  unknown_package: { status: 404, message: 'პაკეტი ვერ მოიძებნა' },
  unknown_tier: { status: 404, message: 'გეგმა ვერ მოიძებნა' },
};

function sendSpendOutcome(
  res: Response<ApiResponse<{ tokens?: number }>>,
  outcome: SpendOutcome,
): void {
  if (outcome.ok) {
    res.status(200).json({ success: true, data: { tokens: outcome.tokens } });
    return;
  }
  const mapped = SPEND_ERRORS[outcome.reason] ?? { status: 400, message: 'მოთხოვნა ვერ შესრულდა' };
  res.status(mapped.status).json({ success: false, error: mapped.message, reason: outcome.reason });
}

const billingRouter = Router();

billingRouter.use(authenticateJwt, requireUserRole);

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

billingRouter.get(
  '/referral',
  async (req: Request, res: Response<ApiResponse<ReferralSummary>>): Promise<void> => {
    try {
      const userId = (req as AuthenticatedRequest).user.userId;
      const summary = await getReferralSummary(userId);
      res.status(200).json({ success: true, data: summary });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[GET /billing/referral]', err);
      res.status(500).json({ success: false, error: 'სერვერის შეცდომა' });
    }
  },
);

billingRouter.post(
  '/referral/spend-tokens',
  async (req: Request, res: Response<ApiResponse<{ tokens?: number }>>): Promise<void> => {
    try {
      const userId = (req as AuthenticatedRequest).user.userId;
      const packageId = Number((req.body as { packageId?: unknown }).packageId);
      if (!Number.isInteger(packageId) || packageId <= 0) {
        res.status(400).json({ success: false, error: 'packageId is required' });
        return;
      }
      sendSpendOutcome(res, await spendReferralOnTokens(userId, packageId));
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[POST /billing/referral/spend-tokens]', err);
      res.status(500).json({ success: false, error: 'სერვერის შეცდომა' });
    }
  },
);

billingRouter.post(
  '/referral/spend-subscription',
  async (req: Request, res: Response<ApiResponse<{ tokens?: number }>>): Promise<void> => {
    try {
      const userId = (req as AuthenticatedRequest).user.userId;
      const tier = String((req.body as { tier?: unknown }).tier ?? '');
      if (!tier) {
        res.status(400).json({ success: false, error: 'tier is required' });
        return;
      }
      sendSpendOutcome(res, await spendReferralOnSubscription(userId, tier));
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[POST /billing/referral/spend-subscription]', err);
      res.status(500).json({ success: false, error: 'სერვერის შეცდომა' });
    }
  },
);

export default billingRouter;
