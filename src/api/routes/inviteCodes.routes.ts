import { Router, Request, Response } from 'express';
import { param, validationResult } from 'express-validator';
import { rateLimit } from '../middleware/rateLimit.middleware';
import { inviteCodeExists } from '../../services/inviteCodeCheck.service';

/**
 * 2641 (§99.11): GET /invite-codes/:code → { exists: boolean }, before the
 * join page draws its welcome. Public (the person has no account yet), so it
 * is rate-limited by address and answers one bit only.
 */
/**
 * The 21 Oct launch (D787, the tester's 61646): about a hundred people open
 * one invitation link within an hour, most on mobile data, where a carrier
 * puts many phones behind one address, the rest on one room's Wi-Fi. Twenty
 * checks a minute per address turned the twenty-first person in the same
 * minute away at the door. The address now gets the sign-in routes' allowance
 * (auth.routes: 1,500 in five minutes, a hundred people at once); a code is
 * long and random, so this is still no help to anyone guessing codes.
 */
const CHECK_WINDOW_MS = 5 * 60_000;
const CHECKS_PER_ADDRESS = 1_500;
const MAX_CODE_CHARS = 32;
const CODE_RE = /^[A-Za-z0-9_-]+$/;

const inviteCodesRouter = Router();
inviteCodesRouter.use(
  rateLimit({ windowMs: CHECK_WINDOW_MS, max: CHECKS_PER_ADDRESS, keyBy: 'ip' }),
);

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
