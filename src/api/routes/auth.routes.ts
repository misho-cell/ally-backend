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
import { ApiResponse, EligibilityMode, EligibilityReason } from '../../types';
import { rateLimit } from '../middleware/rateLimit.middleware';

const authRouter = Router();

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
      const result = await registerUser(phone, name, referralPhone);
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
      const { phone, referralPhone } = req.body as { phone: string; referralPhone?: string };
      const result = await checkRegistrationEligibility(phone, referralPhone);
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
