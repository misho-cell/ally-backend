import { Router, Request, Response, NextFunction } from 'express';
import { param, body, validationResult } from 'express-validator';
import {
  authenticateJwt,
  requireUserRole,
  AuthenticatedRequest,
} from '../middleware/auth.middleware';
import { rateLimit } from '../middleware/rateLimit.middleware';
import {
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
  handleValidationErrors,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = (req as AuthenticatedRequest).user.userId;
      const ref = String(req.params.ref);
      const action = String(req.params.action) as IntroductionAction;
      const { response, days } = req.body as { response?: string; days?: number };

      const outcome = await resolveIntroductionRequest(userId, { requestRef: ref }, action, {
        response,
        snoozeDays: days,
        source: 'button',
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
