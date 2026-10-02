import { Router, Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import {
  authenticateJwt,
  requireUserRole,
  AuthenticatedRequest,
} from '../middleware/auth.middleware';
import { requireSubscription } from '../middleware/subscription.middleware';
import {
  savePushSubscription,
  deletePushSubscription,
  getVapidPublicKey,
  PushSubscriptionPayload,
} from '../../services/notification.service';
import {
  recordNotificationState,
  isNotificationState,
  NOTIFICATION_STATES,
} from '../../services/notificationState.service';
import { ApiResponse } from '../../types';

const notificationsRouter = Router();

notificationsRouter.use(authenticateJwt, requireUserRole);

/**
 * ROW 276 — the browser tells us the one thing only it knows.
 *
 * ⚠️ REGISTERED ABOVE `requireSubscription`, AND THAT IS THE POINT. Express
 * applies middleware in the order it is added, so this route is outside the
 * payment gate while everything below stays inside it.
 *
 * A lapsed account is exactly the account whose silence we most need
 * explained, and a 402 here would throw away the report instead of the person
 * — we would keep not knowing whether they were never asked, said no, or said
 * yes into a registration that failed. Nothing is spent by listening, and the
 * row carries no new power: five words and a boolean.
 *
 * It is a POST because it writes, and it writes one row per account which the
 * next report overwrites. There is no reading of anybody else's state here;
 * the summary lives on the admin side, in counts.
 */
notificationsRouter.post(
  '/state',
  body('state').isString().trim().notEmpty(),
  body('standalone').optional().isBoolean(),
  async (
    req: Request,
    res: Response<ApiResponse<{ state: string; standalone: boolean | null; state_since: string }>>,
  ) => {
    const { state, standalone } = req.body as { state?: unknown; standalone?: unknown };
    if (!isNotificationState(state)) {
      res.status(400).json({
        success: false,
        error: `state must be one of: ${NOTIFICATION_STATES.join(', ')}`,
      });
      return;
    }
    const userId = String((req as AuthenticatedRequest).user.userId);
    try {
      // Absent is stored as NULL rather than false: a browser that did not say
      // is not a browser that said no, and this table exists to stop exactly
      // that kind of collapse.
      const stored = await recordNotificationState(
        userId,
        state,
        typeof standalone === 'boolean' ? standalone : null,
      );
      res.status(200).json({ success: true, data: stored });
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('[notifications] could not record state:', error);
      res.status(500).json({ success: false, error: 'სერვერის შეცდომა' });
    }
  },
);

notificationsRouter.use(requireSubscription);

notificationsRouter.get(
  '/vapid-public-key',
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
  body('endpoint').isString().trim().notEmpty().withMessage('endpoint is required'),
  body('keys.p256dh').isString().trim().notEmpty().withMessage('keys.p256dh is required'),
  body('keys.auth').isString().trim().notEmpty().withMessage('keys.auth is required'),
  // Ticket 17 row 6: optional, and deliberately NOT allowed to refuse a
  // subscription. A device we cannot name is still a device we must be able to
  // notify, and the frontend rightly held the field back until it knew a
  // strict validator would not break subscribing. It will not: only the three
  // above are checked, and an absent or odd user_agent is simply stored as
  // null (see savePushSubscription, which also truncates it).
  body('user_agent').optional().isString(),
  // Row 6's fix: the frontend's own stable name for this device, if it has one.
  // Same rule as above — optional, and never a reason to refuse a device.
  body('device_id').optional().isString(),
  // Row 101: the endpoint this registration REPLACES, named by the only party
  // that knows — the browser. Optional, and like the two above it can never be
  // a reason to refuse a subscription: a client that sends a malformed one
  // must still end up subscribed, because failing here would leave the person
  // unreachable in order to tidy a duplicate.
  body('previous_endpoint').optional().isString(),
  // Push quiet hours (G-002): the device's IANA time zone. Optional and never a
  // reason to refuse — an unknown zone is stored as null and Tbilisi is used.
  body('time_zone').optional().isString(),
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
      // When the client sends no user_agent, the request header is the same
      // browser saying the same thing — so take it rather than store a device
      // we cannot name. Every subscription made before row 6 is nameless, and
      // a nameless one can only fall back to the old all-or-nothing rule.
      await savePushSubscription(userId, {
        ...subscription,
        user_agent: subscription.user_agent ?? req.get('user-agent'),
        // Their authHeaders() already carries X-Device-Id on every request, so
        // the subscription can be named even if the body field is ever dropped.
        device_id: subscription.device_id ?? req.get('x-device-id'),
        time_zone: subscription.time_zone ?? req.get('x-time-zone'),
      });
      res.status(200).json({ success: true, data: null });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to save subscription';
      res.status(500).json({ success: false, error: message });
    }
  },
);

notificationsRouter.delete(
  '/subscribe',
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
