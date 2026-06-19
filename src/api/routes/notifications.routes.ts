import { Router, Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import { authenticateJwt, AuthenticatedRequest } from '../middleware/auth.middleware';
import {
  savePushSubscription,
  deletePushSubscription,
  getVapidPublicKey,
  PushSubscriptionPayload,
} from '../../services/notification.service';
import { ApiResponse } from '../../types';

const notificationsRouter = Router();

notificationsRouter.get(
  '/vapid-public-key',
  authenticateJwt,
  (_req: Request, res: Response<ApiResponse<{ key: string }>>) => {
    const key = getVapidPublicKey();

    if (!key) {
      res.status(503).json({ success: false, error: 'Push notifications not configured' });
      return;
    }

    res.status(200).json({ success: true, data: { key } });
  },
);

notificationsRouter.post(
  '/subscribe',
  authenticateJwt,
  body('endpoint').isString().trim().notEmpty().withMessage('endpoint is required'),
  body('keys.p256dh').isString().trim().notEmpty().withMessage('keys.p256dh is required'),
  body('keys.auth').isString().trim().notEmpty().withMessage('keys.auth is required'),
  async (req: Request, res: Response<ApiResponse<null>>) => {
    const errors = validationResult(req);

    if (!errors.isEmpty()) {
      const message = errors
        .array()
        .map((e) => e.msg)
        .join(', ');
      res.status(400).json({ success: false, error: message });
      return;
    }

    try {
      const userId = (req as AuthenticatedRequest).user.userId;
      const subscription = req.body as PushSubscriptionPayload;
      await savePushSubscription(userId, subscription);
      res.status(200).json({ success: true, data: null });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to save subscription';
      res.status(500).json({ success: false, error: message });
    }
  },
);

notificationsRouter.delete(
  '/subscribe',
  authenticateJwt,
  body('endpoint').isString().trim().notEmpty().withMessage('endpoint is required'),
  async (req: Request, res: Response<ApiResponse<null>>) => {
    const errors = validationResult(req);

    if (!errors.isEmpty()) {
      const message = errors
        .array()
        .map((e) => e.msg)
        .join(', ');
      res.status(400).json({ success: false, error: message });
      return;
    }

    try {
      const userId = (req as AuthenticatedRequest).user.userId;
      const { endpoint } = req.body as { endpoint: string };
      await deletePushSubscription(userId, endpoint);
      res.status(200).json({ success: true, data: null });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to remove subscription';
      res.status(500).json({ success: false, error: message });
    }
  },
);

export default notificationsRouter;
