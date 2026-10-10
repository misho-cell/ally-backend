import { Router, Request, Response } from 'express';
import {
  authenticateJwt,
  requireUserRole,
  AuthenticatedRequest,
} from '../middleware/auth.middleware';
import { rateLimit } from '../middleware/rateLimit.middleware';
import {
  isDeviceId,
  isGadget,
  isSetupStep,
  isStepStatus,
  recordStep,
  setupState,
} from '../../services/setupState.service';
import { sendTestPush, TestPushOutcome } from '../../services/setupTestPush.service';

/**
 * 1882 / the frontend's 06:30Z item 10:
 *   GET  /setup/state                              { done_count, total, server, devices }
 *   PUT  /setup/devices/:deviceId/steps/:step      { gadget, status } → the new state
 *   POST /setup/test-push                          one test notification to this person
 * No subscription needed: setup is what a new person does first.
 */
const REQUESTS_PER_MINUTE = 30;
const TEST_PUSHES_PER_MINUTE = 3;

const setupRouter = Router();
setupRouter.use(authenticateJwt, requireUserRole);
setupRouter.use(rateLimit({ windowMs: 60_000, max: REQUESTS_PER_MINUTE }));

function userIdOf(req: Request): number {
  return Number((req as AuthenticatedRequest).user.userId);
}

setupRouter.get('/state', async (req: Request, res: Response): Promise<void> => {
  try {
    res.status(200).json({ success: true, data: await setupState(userIdOf(req)) });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[GET /setup/state]', (error as Error).message);
    res.status(500).json({ success: false, error: 'Could not read the setup state' });
  }
});

setupRouter.put(
  '/devices/:deviceId/steps/:step',
  async (req: Request, res: Response): Promise<void> => {
    const { deviceId, step } = req.params;
    const { gadget, status } = (req.body ?? {}) as { gadget?: unknown; status?: unknown };
    if (!isDeviceId(deviceId) || !isSetupStep(step) || !isGadget(gadget) || !isStepStatus(status)) {
      res.status(400).json({
        success: false,
        error: 'deviceId (1-64 of A-Z a-z 0-9 _ -), a known step, gadget and status are required',
      });
      return;
    }
    try {
      const userId = userIdOf(req);
      await recordStep(userId, deviceId, gadget, step, status);
      res.status(200).json({ success: true, data: await setupState(userId) });
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('[PUT /setup/steps]', (error as Error).message);
      res.status(500).json({ success: false, error: 'Could not save the step' });
    }
  },
);

const TEST_PUSH_REFUSAL: Readonly<Record<string, { status: number; error: string }>> = {
  [TestPushOutcome.Off]: { status: 403, error: 'The test notification is not switched on yet' },
  [TestPushOutcome.NoSubscription]: {
    status: 404,
    error: 'No notification subscription on this account yet',
  },
};

setupRouter.post(
  '/test-push',
  rateLimit({ windowMs: 60_000, max: TEST_PUSHES_PER_MINUTE }),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const outcome = await sendTestPush(userIdOf(req));
      const refusal = TEST_PUSH_REFUSAL[outcome];
      if (refusal !== undefined) {
        res.status(refusal.status).json({ success: false, error: refusal.error });
        return;
      }
      res.status(200).json({ success: true, data: { sent: true } });
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('[POST /setup/test-push]', (error as Error).message);
      res.status(500).json({ success: false, error: 'Could not send the test notification' });
    }
  },
);

export default setupRouter;
