import { Router, Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import {
  requestOTP,
  resendOTP,
  verifyOTP,
  registerUser,
  adminLogin,
  completeLogin,
} from '../../services/auth.service';
import { checkRegistrationEligibility } from '../../services/inviteGate.service';
import { recordLinkOpened, recordLinkShared } from '../../services/referralLink.service';
import {
  authenticateJwt,
  requireUserRole,
  AuthenticatedRequest,
} from '../middleware/auth.middleware';
import { ApiResponse, EligibilityMode, EligibilityReason } from '../../types';
import { rateLimit } from '../middleware/rateLimit.middleware';

const authRouter = Router();

/**
 * THE REFERRAL CODE, UNDER ANY SPELLING THE CLIENT USES — row 229.
 *
 * `/referral/opened` already learned this the expensive way: the deployed
 * /join page sent `{referralCode}` while the route demanded `{code}`, every
 * real page load was rejected 400, and the funnel never moved. That route
 * accepts both spellings now, and the comment there says why — „a route this
 * endpoint-shaped must not lose real events over a field name."
 *
 * REGISTRATION WAS LEFT ON ONE SPELLING, and it is the route where the same
 * mistake costs the most AND shows the least. A rejected page load is a 400
 * somebody can see. A registration that arrives with the code under the wrong
 * key is not an error at all: `referralCode` is simply `undefined`, the gate
 * falls through to `mode: 'open'`, the account is created, the person is let
 * in, and the inviter is lost for good with nothing anywhere saying so.
 *
 * WHAT IS MEASURED, 22 September. The last attributed registration in this
 * database is 31 August 14:36; since then 25 real registrations and zero
 * attributed. Inside that same window `referral_link_events` holds FIFTEEN
 * `opened` rows, the most recent on 15 September — and `recordLinkOpened`
 * writes a row ONLY when `findUserByReferralCode` resolves the code. So a
 * resolvable code demonstrably reaches this server in this window, and the
 * codes themselves are well formed (42 issued, all eight characters, all
 * upper case). „The code is invalid" is eliminated; what is left is the code
 * not arriving at registration under the name registration reads.
 *
 * THIS DOES NOT PROVE THE CLIENT SENDS THE WRONG NAME and is not written as
 * though it does — the visitor who opens a link and the person who registers
 * cannot be joined from here, because `referral_link_events` records the link
 * OWNER. It removes a whole class of cause instead of diagnosing one, which is
 * the only thing a backend can do about a field it never receives.
 *
 * `ref` is included because it is the spelling the link itself carries:
 * `/join?ref=CODE`, written by `getInviteLink`. A page passing its own query
 * parameter straight through is the likeliest shape of this bug.
 */
export const REFERRAL_CODE_KEYS = ['referralCode', 'code', 'ref'] as const;

export interface ReferralCodeIn {
  /** The code itself. Never logged, never echoed: it is a credential (D149). */
  readonly code?: string;
  /** WHICH spelling carried it, or undefined when none did. Safe to log. */
  readonly key?: (typeof REFERRAL_CODE_KEYS)[number];
}

export function referralCodeFrom(body: unknown): ReferralCodeIn {
  if (typeof body !== 'object' || body === null) return {};
  const bag = body as Record<string, unknown>;
  for (const key of REFERRAL_CODE_KEYS) {
    const raw = bag[key];
    if (typeof raw !== 'string') continue;
    const trimmed = raw.trim();
    if (trimmed !== '') return { code: trimmed, key };
  }
  return {};
}

// Unauthenticated endpoints — limit by IP to curb OTP/login abuse.
authRouter.use(rateLimit({ windowMs: 5 * 60_000, max: 30 }));

// Tighter, per-device limit on the SMS-sending endpoints specifically, so a
// single device can't burn the SMS budget behind a shared/NAT'd IP (F4).
const OTP_SEND_WINDOW_MS = 10 * 60_000;
const OTP_SEND_MAX_PER_DEVICE = 5;
const limitOtpSends = rateLimit({
  windowMs: OTP_SEND_WINDOW_MS,
  max: OTP_SEND_MAX_PER_DEVICE,
  keyBy: 'device',
});

authRouter.post(
  '/request-otp',
  limitOtpSends,
  body('phone').isString().trim().notEmpty().withMessage('phone is required'),
  body('actionType')
    .isIn(['REGISTER', 'AUTH', 'RECOVER'])
    .withMessage('actionType must be REGISTER, AUTH, or RECOVER'),
  async (req: Request, res: Response<ApiResponse<{ sent: boolean }>>) => {
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
      const { phone, actionType } = req.body as {
        phone: string;
        actionType: 'REGISTER' | 'AUTH' | 'RECOVER';
      };
      await requestOTP(phone, actionType);
      res.status(200).json({ success: true, data: { sent: true } });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'OTP გაგზავნა ვერ მოხერხდა';
      res.status(400).json({ success: false, error: message });
    }
  },
);

authRouter.post(
  '/resend-otp',
  limitOtpSends,
  body('phone').isString().trim().notEmpty().withMessage('phone is required'),
  body('actionType')
    .isIn(['REGISTER', 'AUTH', 'RECOVER'])
    .withMessage('actionType must be REGISTER, AUTH, or RECOVER'),
  async (req: Request, res: Response<ApiResponse<{ sent: boolean }>>) => {
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
      const { phone, actionType } = req.body as {
        phone: string;
        actionType: 'REGISTER' | 'AUTH' | 'RECOVER';
      };
      await resendOTP(phone, actionType);
      res.status(200).json({ success: true, data: { sent: true } });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'SMS გაგზავნა ვერ მოხერხდა';
      res.status(400).json({ success: false, error: message });
    }
  },
);

authRouter.post(
  '/verify-otp',
  body('phone').isString().trim().notEmpty().withMessage('phone is required'),
  body('code').isString().isLength({ min: 6, max: 6 }).withMessage('code must be 6 digits'),
  body('actionType')
    .isIn(['REGISTER', 'AUTH', 'RECOVER'])
    .withMessage('actionType must be REGISTER, AUTH, or RECOVER'),
  async (req: Request, res: Response<ApiResponse<{ verified: boolean }>>) => {
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
      const { phone, code, actionType } = req.body as {
        phone: string;
        code: string;
        actionType: 'REGISTER' | 'AUTH' | 'RECOVER';
      };
      await verifyOTP(phone, code, actionType);
      res.status(200).json({ success: true, data: { verified: true } });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'OTP გადამოწმება ვერ მოხერხდა';
      res.status(400).json({ success: false, error: message });
    }
  },
);

authRouter.post(
  '/complete-login',
  body('phone').isString().trim().notEmpty().withMessage('phone is required'),
  async (req: Request, res: Response<ApiResponse<{ token: string; isNewUser: boolean }>>) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      const message = errors
        .array()
        .map((e) => String(e.msg))
        .join(', ');
      res.status(400).json({ success: false, error: message });
      return;
    }

    try {
      const { phone } = req.body as { phone: string };
      const result = await completeLogin(phone);
      res.status(200).json({ success: true, data: result });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'შესვლა ვერ მოხერხდა';
      res.status(400).json({ success: false, error: message });
    }
  },
);

authRouter.post(
  '/register',
  body('phone').isString().trim().notEmpty().withMessage('phone is required'),
  body('name').isString().trim().notEmpty().withMessage('name is required'),
  body('referralPhone').optional().isString().trim(),
  body('referralCode').optional().isString().trim(),
  async (req: Request, res: Response<ApiResponse<{ token: string }>>) => {
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
      const { phone, name, referralPhone } = req.body as {
        phone: string;
        name: string;
        referralPhone?: string;
      };
      const ref = referralCodeFrom(req.body);
      // The KEY, never the code. „Which spelling arrived" is the one thing
      // three weeks of silence could not answer, and a field name is not a
      // credential — the code itself stays out of the log exactly as a phone
      // number does (D149).
      // eslint-disable-next-line no-console
      console.log(`[register] referral code arrived under: ${ref.key ?? 'NO KEY AT ALL'}`);
      const result = await registerUser(phone, name, referralPhone, ref.code);
      res.status(201).json({ success: true, data: result });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'რეგისტრაცია ვერ მოხერხდა';
      res.status(400).json({ success: false, error: message });
    }
  },
);

authRouter.post(
  '/eligibility',
  body('phone').isString().trim().notEmpty().withMessage('phone is required'),
  body('referralPhone').optional().isString().trim(),
  body('referralCode').optional().isString().trim(),
  async (
    req: Request,
    res: Response<
      ApiResponse<{ eligible: boolean; mode?: EligibilityMode; reason?: EligibilityReason }>
    >,
  ) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      const message = errors
        .array()
        .map((e) => String(e.msg))
        .join(', ');
      res.status(400).json({ success: false, error: message });
      return;
    }

    try {
      const { phone, referralPhone } = req.body as {
        phone: string;
        referralPhone?: string;
      };
      const result = await checkRegistrationEligibility(
        phone,
        referralPhone,
        referralCodeFrom(req.body).code,
      );
      // inviterUserId stays server-side — no user ids for unauthenticated callers.
      res.status(200).json({
        success: true,
        data: { eligible: result.eligible, mode: result.mode, reason: result.reason },
      });
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Eligibility check error:', error);
      res.status(500).json({ success: false, error: 'სერვერის შეცდომა' });
    }
  },
);

// Engine T3: the landing page calls this the moment it renders with
// ?ref=CODE, before the visitor has decided whether to register. No auth —
// this is hit by an anonymous browser. An unresolvable code never writes a
// row (a stale or mistyped link must not error on someone's phone) and now
// says so honestly — live-caught: an invented code got {"recorded":true}
// back, which let anyone inflate the "opened" figure risk-free.
authRouter.post(
  '/referral/opened',
  // Ticket 7 Task 6 item 1, live-caught by the tester: the deployed /join
  // page sends {referralCode} while this route demanded {code} — every real
  // page load was rejected 400 and the funnel never moved. Both spellings
  // are accepted now; a route this endpoint-shaped must not lose real
  // events over a field name.
  async (req: Request, res: Response<ApiResponse<{ recorded: boolean }>>) => {
    const bodyIn = req.body as { code?: unknown; referralCode?: unknown };
    const raw = typeof bodyIn.code === 'string' ? bodyIn.code : bodyIn.referralCode;
    const code = typeof raw === 'string' ? raw.trim() : '';
    if (!code) {
      res.status(400).json({ success: false, error: 'code is required' });
      return;
    }
    try {
      const recorded = await recordLinkOpened(code);
      res.status(200).json({ success: true, data: { recorded } });
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('[referral opened] error:', error);
      res.status(500).json({ success: false, error: 'სერვერის შეცდომა' });
    }
  },
);

// Ticket 7 task 6 item 3: the REAL 'sent' — the app calls this when the user
// actually takes the share action (native share sheet opened / share-box
// copy). Authenticated: only the sharer can move their own funnel. The
// get_invite_link tool call itself now counts as 'issued', never 'sent'.
authRouter.post(
  '/referral/shared',
  authenticateJwt,
  requireUserRole,
  async (req: Request, res: Response<ApiResponse<{ recorded: boolean }>>) => {
    try {
      const userId = (req as AuthenticatedRequest).user.userId;
      await recordLinkShared(userId);
      res.status(200).json({ success: true, data: { recorded: true } });
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('[referral shared] error:', error);
      res.status(500).json({ success: false, error: 'სერვერის შეცდომა' });
    }
  },
);

authRouter.post(
  '/admin/login',
  body('email').isEmail().withMessage('valid email is required'),
  body('password').isString().notEmpty().withMessage('password is required'),
  async (req: Request, res: Response<ApiResponse<{ token: string }>>) => {
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
      const { email, password } = req.body as { email: string; password: string };
      const result = await adminLogin(email, password);
      res.status(200).json({ success: true, data: result });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'ავტორიზაცია ვერ მოხერხდა';
      res.status(401).json({ success: false, error: message });
    }
  },
);

export default authRouter;
