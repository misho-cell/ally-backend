import { Router, Request, Response, NextFunction } from 'express';
import { param, body, validationResult } from 'express-validator';
import {
  authenticateJwt,
  requireUserRole,
  AuthenticatedRequest,
} from '../middleware/auth.middleware';
import { rateLimit } from '../middleware/rateLimit.middleware';
import {
  IntroChannel,
  resolveIntroductionRequest,
  IntroductionAction,
} from '../../services/introduction.service';
import { ApiResponse } from '../../types';

const requestsRouter = Router();

const ACTIONS: readonly IntroductionAction[] = ['accept', 'decline', 'snooze'];
const MAX_RESPONSE_CHARS = 500;
const MIN_SNOOZE_DAYS = 1;
const MAX_SNOOZE_DAYS = 30;

// No subscription gate on purpose: a mediator whose subscription lapsed must
// still be able to answer (or decline) someone waiting on them.
requestsRouter.use(authenticateJwt, requireUserRole);
requestsRouter.use(rateLimit({ windowMs: 60_000, max: 30 }));

function handleValidationErrors(
  req: Request,
  res: Response<ApiResponse<unknown>>,
  next: NextFunction,
): void {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const message = errors
      .array()
      .map((err) => err.msg)
      .join(', ');
    res.status(400).json({ success: false, error: message });
    return;
  }
  next();
}

/**
 * One decision endpoint per action, addressed by the request's public ref:
 *   POST /requests/:ref/accept   { response? }
 *   POST /requests/:ref/decline  { response? }
 *   POST /requests/:ref/snooze   { days? }     (default 3, clamps 1–30)
 * Idempotent: repeating the applied answer returns success with already:true;
 * a conflicting answer returns 409.
 */
requestsRouter.post(
  '/:ref/:action',
  param('ref').isUUID().withMessage('ref must be a valid request ref'),
  param('action')
    .isIn([...ACTIONS])
    .withMessage('action must be accept, decline or snooze'),
  body('response')
    .optional()
    .isString()
    .trim()
    .isLength({ max: MAX_RESPONSE_CHARS })
    .withMessage(`response must be at most ${MAX_RESPONSE_CHARS} characters`),
  body('days')
    .optional()
    .isInt({ min: MIN_SNOOZE_DAYS, max: MAX_SNOOZE_DAYS })
    .withMessage(`days must be between ${MIN_SNOOZE_DAYS} and ${MAX_SNOOZE_DAYS}`),
  /**
   * ITEM 5 WAS BUILT ON THE PATH NOBODY WALKS, and request 1123 is how I found
   * out. The seat accepted it at 13:12:35 through the app's own button:
   *
   *   status accepted · intro_channel NULL · respond_to_introduction called
   *   ZERO times, ever
   *
   * The guard that refuses a channel-less accept lives in the CHAT TOOL. This
   * route — the one a mediator actually presses — never had it, so the choice
   * was never asked and a stored NULL reads as `direct`: the number goes, in
   * silence, which is exactly the arrangement item 5 exists to end.
   *
   * THIS IS THE ADDITIVE HALF and it is all a backend may decide alone. The
   * field is accepted and recorded, so the app can send the mediator's choice
   * as soon as it offers one. What is NOT here is a refusal: making this route
   * reject an accept with no channel would break the button under real people
   * mid-flight, and whether a bare yes should stop working is a product call
   * with somebody's phone number on the end of it. That question is with Misho
   * and the founder, and it is written up rather than taken.
   */
  body('channel')
    .optional()
    .isIn(['direct', 'via_mediator'])
    .withMessage('channel must be direct or via_mediator'),
  handleValidationErrors,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = (req as AuthenticatedRequest).user.userId;
      const ref = String(req.params.ref);
      const action = String(req.params.action) as IntroductionAction;
      const { response, days, channel } = req.body as {
        response?: string;
        days?: number;
        channel?: IntroChannel;
      };

      const outcome = await resolveIntroductionRequest(userId, { requestRef: ref }, action, {
        response,
        snoozeDays: days,
        source: 'button',
        ...(channel !== undefined && { channel }),
      });

      if (!outcome.ok) {
        res.status(outcome.code === 'not_found' ? 404 : 409).json({
          success: false,
          error: outcome.error ?? 'მოთხოვნა ვერ მოიძებნა',
        });
        return;
      }

      res.status(200).json({
        success: true,
        data: {
          request_ref: ref,
          action,
          status: outcome.status,
          ...(outcome.already === true && { already: true }),
          ...(outcome.snoozedUntil != null && { snoozed_until: outcome.snoozedUntil }),
        },
      });
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('[POST /requests/:ref/:action]', error);
      res.status(500).json({ success: false, error: 'სერვერის შეცდომა' });
    }
  },
);

export default requestsRouter;
