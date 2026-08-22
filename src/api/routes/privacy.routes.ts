import { Router, Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import { authenticateJwt, AuthenticatedRequest } from '../middleware/auth.middleware';
import { rateLimit } from '../middleware/rateLimit.middleware';
import { ApiResponse } from '../../types';
import {
  getMyDataSummary,
  deleteMyAccount,
  exportMyData,
  ErasureReport,
} from '../../services/privacyRights.service';

// The rights portal the Privacy Policy already promises (ticket 4, item 0).
// Deliberately NOT behind requireSubscription: the right to erasure cannot
// depend on having paid.
const privacyRouter = Router();

privacyRouter.use(authenticateJwt);
// Erasure is irreversible; a tight limit makes a runaway client harmless.
privacyRouter.use(rateLimit({ windowMs: 60_000, max: 10 }));

// The confirmation phrase the client must echo. A mis-routed POST, a retried
// request or a curious script must never be able to erase an account.
const DELETE_CONFIRMATION = 'DELETE MY ACCOUNT';

privacyRouter.get(
  '/my-data/summary',
  async (req: Request, res: Response<ApiResponse<unknown>>): Promise<void> => {
    try {
      const userId = (req as AuthenticatedRequest).user.userId;
      const counts = await getMyDataSummary(String(userId));
      res.status(200).json({ success: true, data: { records: counts } });
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('[GET /privacy/my-data/summary]', error);
      res.status(500).json({ success: false, error: 'სერვერის შეცდომა' });
    }
  },
);

// The export the Privacy Policy promises — a legal commitment that had no
// code behind it (ticket 6 build list, item 6).
privacyRouter.get(
  '/my-data/export',
  async (req: Request, res: Response<ApiResponse<unknown>>): Promise<void> => {
    try {
      const userId = (req as AuthenticatedRequest).user.userId;
      const data = await exportMyData(String(userId));
      res.status(200).json({ success: true, data });
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('[GET /privacy/my-data/export]', error);
      res.status(500).json({ success: false, error: 'სერვერის შეცდომა' });
    }
  },
);

privacyRouter.post(
  '/my-data/delete',
  body('confirm').isString().withMessage('confirm is required'),
  body('dry_run').optional().isBoolean(),
  async (req: Request, res: Response<ApiResponse<ErasureReport>>): Promise<void> => {
    if (!validationResult(req).isEmpty()) {
      res.status(400).json({ success: false, error: 'confirm ველი აუცილებელია' });
      return;
    }
    try {
      const userId = (req as AuthenticatedRequest).user.userId;
      const { confirm, dry_run: dryRun } = req.body as { confirm: string; dry_run?: boolean };
      if (confirm.trim().toUpperCase() !== DELETE_CONFIRMATION) {
        res.status(400).json({
          success: false,
          error: `დასადასტურებლად გამოაგზავნე confirm: "${DELETE_CONFIRMATION}"`,
        });
        return;
      }
      const report = await deleteMyAccount(String(userId), dryRun === true);
      // eslint-disable-next-line no-console
      console.log(
        `[erasure] account ${userId} ${report.dryRun ? 'previewed' : 'ERASED'} — ` +
          `${Object.keys(report.rowsDeleted).length} table(s)`,
      );
      res.status(200).json({ success: true, data: report });
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('[POST /privacy/my-data/delete]', error);
      res.status(500).json({ success: false, error: 'წაშლა ვერ დასრულდა — ცვლილება არ შესულა' });
    }
  },
);

export default privacyRouter;
