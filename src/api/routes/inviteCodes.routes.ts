import { Router, Request, Response } from 'express';
import { param, validationResult } from 'express-validator';
import { rateLimit } from '../middleware/rateLimit.middleware';
import { inviteCodeExists } from '../../services/inviteCodeCheck.service';

/**
 * 2641 (§99.11): GET /invite-codes/:code → { exists: boolean }, before the
 * join page draws its welcome. Public (the person has no account yet), so it
 * is rate-limited by IP and answers one bit only.
 */
const CHECKS_PER_MINUTE = 20;
const MAX_CODE_CHARS = 32;
const CODE_RE = /^[A-Za-z0-9_-]+$/;

const inviteCodesRouter = Router();
inviteCodesRouter.use(rateLimit({ windowMs: 60_000, max: CHECKS_PER_MINUTE }));

inviteCodesRouter.get(
  '/:code',
  param('code').trim().isLength({ min: 1, max: MAX_CODE_CHARS }).matches(CODE_RE),
  async (req: Request, res: Response): Promise<void> => {
    if (!validationResult(req).isEmpty()) {
      res.status(400).json({ success: false, error: 'Not a valid invite code' });
      return;
    }
    try {
      const exists = await inviteCodeExists(String(req.params.code));
      res.status(200).json({ success: true, data: { exists } });
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('[GET /invite-codes/:code]', (error as Error).message);
      res.status(500).json({ success: false, error: 'Could not check the invite code' });
    }
  },
);

export default inviteCodesRouter;
