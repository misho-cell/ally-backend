import { Router, Request, Response } from 'express';
import { rateLimit } from '../middleware/rateLimit.middleware';
import { billingOffer } from '../../services/billingOffer.service';

/**
 *   GET /billing/offer   { card_trial_days, invite_free_days | null }
 *
 * Public on purpose: the pricing page is also read signed out, and both
 * numbers are what the page already promises to anybody. Mounted ahead of
 * the signed-in /billing router.
 */
const REQUESTS_PER_MINUTE = 30;

const billingOfferRouter = Router();
billingOfferRouter.use(rateLimit({ windowMs: 60_000, max: REQUESTS_PER_MINUTE }));

billingOfferRouter.get('/', async (_req: Request, res: Response): Promise<void> => {
  try {
    res.status(200).json({ success: true, data: await billingOffer() });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[GET /billing/offer]', (error as Error).message);
    res.status(500).json({ success: false, error: 'Could not read the offer' });
  }
});

export default billingOfferRouter;
