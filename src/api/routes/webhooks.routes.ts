import { Router, Request, Response } from 'express';
import { processWebhookEvent } from '../../services/paddle.service';

const webhooksRouter = Router();

webhooksRouter.post('/paddle', async (req: Request, res: Response): Promise<void> => {
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

export default webhooksRouter;
