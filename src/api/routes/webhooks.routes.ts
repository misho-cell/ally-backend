import { Router, Request, Response } from 'express';
import { processWebhookEvent } from '../../services/paddle.service';
import { constructEvent, handleStripeEvent } from '../../services/stripe.service';

const webhooksRouter = Router();

// Paddle stays in the codebase but is switched OFF while Stripe takes over
// (the founder's ruling, 2 Sep): PADDLE_ENABLED=true turns it back on without
// a deploy. Disabled, it answers 200 so Paddle stops retrying into a service
// that is deliberately not listening, and logs every event it declined so the
// silence is visible.
const PADDLE_ENABLED = (process.env.PADDLE_ENABLED ?? 'false') === 'true';

webhooksRouter.post('/paddle', async (req: Request, res: Response): Promise<void> => {
  if (!PADDLE_ENABLED) {
    // eslint-disable-next-line no-console
    console.log('[paddle] webhook ignored — PADDLE_ENABLED is off');
    res.status(200).json({ success: true, data: { ignored: true } });
    return;
  }
  const rawBody = (req.body as Buffer).toString('utf8');
  const signature = req.headers['paddle-signature'];

  if (!signature || typeof signature !== 'string') {
    res.status(400).json({ success: false, error: 'Missing Paddle-Signature header' });
    return;
  }

  try {
    await processWebhookEvent(rawBody, signature);
    res.status(200).json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    if (message === 'Invalid Paddle webhook signature') {
      res.status(401).json({ success: false, error: 'Invalid signature' });
      return;
    }
    // eslint-disable-next-line no-console
    console.error('[POST /webhooks/paddle]', err);
    res.status(500).json({ success: false, error: 'Webhook processing failed' });
  }
});

// Stripe. The raw body is required for the signature check — /webhooks is
// mounted with express.raw, so req.body is the untouched Buffer Stripe signed.
//
// A 200 is returned for an event we do not act on, deliberately: Stripe retries
// anything else, and this account also carries another product's subscriptions
// whose events we intentionally ignore. Only a real failure gets a 500, so
// Stripe's retry means what it says.
webhooksRouter.post('/stripe', async (req: Request, res: Response): Promise<void> => {
  const signature = req.headers['stripe-signature'];
  if (!signature || typeof signature !== 'string') {
    res.status(400).json({ success: false, error: 'Missing Stripe-Signature header' });
    return;
  }

  let event;
  try {
    event = constructEvent(req.body as Buffer, signature);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[POST /webhooks/stripe] signature rejected:', (err as Error).message);
    res.status(401).json({ success: false, error: 'Invalid signature' });
    return;
  }

  try {
    const outcome = await handleStripeEvent(event);
    // eslint-disable-next-line no-console
    console.log(`[stripe] ${outcome.type} — ${outcome.handled ? 'applied' : 'ignored'}`);
    res.status(200).json({ success: true });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(`[POST /webhooks/stripe] ${event.type} failed:`, err);
    res.status(500).json({ success: false, error: 'Webhook processing failed' });
  }
});

export default webhooksRouter;
