import { Router, Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import {
  authenticateJwt,
  requireUserRole,
  AuthenticatedRequest,
} from '../middleware/auth.middleware';
import { query } from '../../db/postgres/client';
import {
  getDimensions,
  getNextQuestion,
  getAssumptions,
  recordAnswer,
} from '../../services/partH.service';
import { ApiResponse } from '../../types';
import { matchExistingContacts, ExistingContactMatch } from '../../services/contacts.service';
import { rateLimit } from '../middleware/rateLimit.middleware';

interface ProfileData {
  readonly name: string;
  readonly phone: string | null;
  readonly employer: string | null;
  readonly job_position: string | null;
  readonly city: string | null;
  readonly subscription_tier: string;
  readonly subscription_status: string;
  readonly trial_ends_at: string | null;
  readonly current_period_ends_at: string | null;
  /** Minted on first read — the invite currency (founder decision F.1). */
  referral_code?: string | null;
}

// The public fields a user may edit about THEMSELVES (Lika's item 9: "the
// user can see and correct what the product knows about them" — a data-access
// right, not a nicety). Photo upload needs a storage decision and is not here.
const EDITABLE_FIELDS = [
  { key: 'name', column: 'name', maxLen: 80 },
  { key: 'employer', column: 'employer', maxLen: 120 },
  { key: 'job_position', column: '"jobPosition"', maxLen: 120 },
  { key: 'city', column: 'city', maxLen: 80 },
] as const;

const profileRouter = Router();

profileRouter.get(
  '/',
  authenticateJwt,
  requireUserRole,
  async (req: Request, res: Response<ApiResponse<ProfileData>>): Promise<void> => {
    try {
      const userId = (req as AuthenticatedRequest).user.userId;

      const result = await query<ProfileData>(
        `SELECT u.name,
                up.phone,
                u.employer,
                u."jobPosition" AS job_position,
                u.city,
                u.subscription_tier,
                u.subscription_status,
                u.trial_ends_at,
                u.current_period_ends_at
         FROM "User" u
         LEFT JOIN "UserPhone" up ON up."userId" = u.id
         WHERE u.id = $1
         LIMIT 1`,
        [userId],
      );

      const row = result.rows[0];
      if (!row) {
        res.status(404).json({ success: false, error: 'მომხმარებელი ვერ მოიძებნა' });
        return;
      }

      // Minted on first read (founder decision F.1: invites go by code).
      const { getOrCreateReferralCode } = await import('../../services/referralCode.service');
      const referralCode = await getOrCreateReferralCode(userId).catch(() => null);
      res.status(200).json({ success: true, data: { ...row, referral_code: referralCode } });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[GET /profile]', err);
      res.status(500).json({ success: false, error: 'სერვერის შეცდომა' });
    }
  },
);

// Edit the public profile fields. PATCH semantics: only the keys present in
// the body change; an explicit null clears a field (name may not be cleared —
// the ask flow introduces the sender by it).
profileRouter.patch(
  '/',
  authenticateJwt,
  requireUserRole,
  body('name').optional().isString().trim().isLength({ min: 1, max: 80 }),
  body('employer').optional({ nullable: true }).isString().trim().isLength({ max: 120 }),
  body('job_position').optional({ nullable: true }).isString().trim().isLength({ max: 120 }),
  body('city').optional({ nullable: true }).isString().trim().isLength({ max: 80 }),
  async (req: Request, res: Response<ApiResponse<unknown>>): Promise<void> => {
    if (!validationResult(req).isEmpty()) {
      res.status(400).json({ success: false, error: 'არასწორი ველები' });
      return;
    }
    try {
      const userId = (req as AuthenticatedRequest).user.userId;
      const bodyData = req.body as Record<string, unknown>;
      const assignments: string[] = [];
      const params: unknown[] = [userId];
      for (const field of EDITABLE_FIELDS) {
        if (!(field.key in bodyData)) continue;
        const raw = bodyData[field.key];
        const value = raw === null ? null : String(raw).trim().slice(0, field.maxLen);
        if (field.key === 'name' && (value === null || value === '')) continue;
        params.push(value);
        assignments.push(`${field.column} = $${params.length}`);
      }
      if (assignments.length === 0) {
        res.status(400).json({ success: false, error: 'გადმოეცი ერთი ველი მაინც' });
        return;
      }
      await query(`UPDATE "User" SET ${assignments.join(', ')} WHERE id = $1`, params);
      res.status(200).json({ success: true, data: { updated: assignments.length } });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[PATCH /profile]', err);
      res.status(500).json({ success: false, error: 'სერვერის შეცდომა' });
    }
  },
);

// --- Profile photo (Lika's item 9) ------------------------------------------
// Stored in Postgres (migration 058): one image per user, small and capped —
// see the migration comment for why not an object store.
const MAX_AVATAR_BYTES = 300 * 1024;
const ALLOWED_AVATAR_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);

profileRouter.put(
  '/photo',
  authenticateJwt,
  requireUserRole,
  body('mime').isString().trim(),
  body('data_base64').isString().isLength({ min: 1 }),
  async (req: Request, res: Response<ApiResponse<unknown>>): Promise<void> => {
    if (!validationResult(req).isEmpty()) {
      res.status(400).json({ success: false, error: 'mime და data_base64 აუცილებელია' });
      return;
    }
    try {
      const userId = (req as AuthenticatedRequest).user.userId;
      const { mime, data_base64: dataBase64 } = req.body as { mime: string; data_base64: string };
      if (!ALLOWED_AVATAR_MIME.has(mime)) {
        res.status(400).json({ success: false, error: 'დაშვებულია: JPEG, PNG, WebP' });
        return;
      }
      const data = Buffer.from(dataBase64, 'base64');
      if (data.length === 0 || data.length > MAX_AVATAR_BYTES) {
        res.status(400).json({
          success: false,
          error: `ფოტო უნდა იყოს 1 ბაიტიდან ${Math.floor(MAX_AVATAR_BYTES / 1024)}KB-მდე`,
        });
        return;
      }
      await query(
        `INSERT INTO user_avatars (user_id, mime, data)
         VALUES ($1::int, $2, $3)
         ON CONFLICT (user_id) DO UPDATE SET mime = $2, data = $3, updated_at = NOW()`,
        [userId, mime, data],
      );
      res.status(200).json({ success: true, data: { bytes: data.length } });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[PUT /profile/photo]', err);
      res.status(500).json({ success: false, error: 'სერვერის შეცდომა' });
    }
  },
);

profileRouter.get(
  '/photo',
  authenticateJwt,
  requireUserRole,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = (req as AuthenticatedRequest).user.userId;
      const result = await query<{ mime: string; data: Buffer }>(
        'SELECT mime, data FROM user_avatars WHERE user_id = $1::int LIMIT 1',
        [userId],
      );
      const row = result.rows[0];
      if (!row) {
        res.status(404).json({ success: false, error: 'ფოტო არ არის' });
        return;
      }
      res.status(200).set('Content-Type', row.mime).set('Cache-Control', 'private, max-age=300');
      res.send(row.data);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[GET /profile/photo]', err);
      res.status(500).json({ success: false, error: 'სერვერის შეცდომა' });
    }
  },
);

profileRouter.delete(
  '/photo',
  authenticateJwt,
  requireUserRole,
  async (req: Request, res: Response<ApiResponse<unknown>>): Promise<void> => {
    try {
      const userId = (req as AuthenticatedRequest).user.userId;
      await query('DELETE FROM user_avatars WHERE user_id = $1::int', [userId]);
      res.status(200).json({ success: true, data: { deleted: true } });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[DELETE /profile/photo]', err);
      res.status(500).json({ success: false, error: 'სერვერის შეცდომა' });
    }
  },
);

// ─── PART H (ticket 6 task 25): the personalisation surface ─────────────────
// Selector + dimensions + assumptions + answer recording, over migrations
// 061 + 069. All behave correctly on an empty bank.

profileRouter.get(
  '/dimensions',
  authenticateJwt,
  requireUserRole,
  async (req: Request, res: Response<ApiResponse<unknown>>): Promise<void> => {
    try {
      const userId = (req as AuthenticatedRequest).user.userId;
      res.status(200).json({ success: true, data: { dimensions: await getDimensions(userId) } });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[GET /profile/dimensions]', err);
      res.status(500).json({ success: false, error: 'სერვერის შეცდომა' });
    }
  },
);

profileRouter.get(
  '/next-question',
  authenticateJwt,
  requireUserRole,
  async (req: Request, res: Response<ApiResponse<unknown>>): Promise<void> => {
    try {
      const userId = (req as AuthenticatedRequest).user.userId;
      const surface = typeof req.query.surface === 'string' ? req.query.surface : 'any';
      const lang = typeof req.query.lang === 'string' ? req.query.lang : 'ka';
      const result = await getNextQuestion(userId, surface, lang);
      res.status(200).json({ success: true, data: result });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[GET /profile/next-question]', err);
      res.status(500).json({ success: false, error: 'სერვერის შეცდომა' });
    }
  },
);

profileRouter.get(
  '/assumptions',
  authenticateJwt,
  requireUserRole,
  async (req: Request, res: Response<ApiResponse<unknown>>): Promise<void> => {
    try {
      const userId = (req as AuthenticatedRequest).user.userId;
      res.status(200).json({ success: true, data: await getAssumptions(userId) });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[GET /profile/assumptions]', err);
      res.status(500).json({ success: false, error: 'სერვერის შეცდომა' });
    }
  },
);

profileRouter.post(
  '/feedback',
  authenticateJwt,
  requireUserRole,
  async (req: Request, res: Response<ApiResponse<unknown>>): Promise<void> => {
    try {
      const userId = (req as AuthenticatedRequest).user.userId;
      const body = req.body as {
        question_id?: string;
        option_ids?: unknown;
        free_text?: string;
        skipped?: boolean;
        surface?: string;
      };
      if (!body.question_id || typeof body.question_id !== 'string') {
        res.status(400).json({ success: false, error: 'question_id აუცილებელია' });
        return;
      }
      const optionIds = Array.isArray(body.option_ids) ? body.option_ids.map(String) : [];
      const outcome = await recordAnswer(userId, {
        questionId: body.question_id,
        optionIds,
        freeText: typeof body.free_text === 'string' ? body.free_text : undefined,
        skipped: body.skipped === true,
        surface: typeof body.surface === 'string' ? body.surface : undefined,
      });
      res
        .status(outcome.recorded ? 200 : 400)
        .json(
          outcome.recorded
            ? { success: true, data: outcome }
            : { success: false, error: outcome.error ?? 'ჩაწერა ვერ მოხერხდა' },
        );
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[POST /profile/feedback]', err);
      res.status(500).json({ success: false, error: 'სერვერის შეცდომა' });
    }
  },
);

// Engine T4: "your people are here" — during sign-up, right after contact
// permission and BEFORE the full structured import, the registration
// screen checks which phones already belong to a member. No subscription
// gate (unlike /contacts/*) — a brand-new account has not chosen one yet.
//
// This is, in shape, a membership directory: send a phone, learn whether
// its owner is a member and what they're called. Live-caught (24 Aug): 200
// invented numbers in one call answered in under a second with no cap and
// no rate limit — exactly the input a purchased contact list would be, and
// this is the one route that could map it to real names, one account, one
// loop. Three independent guards, since this is a registration feature
// that never needs to run more than a handful of times per account:
//   1. a hard per-request cap (100, generous for a phonebook page);
//   2. a rate limit, keyed per account (the default 'auto' mode);
//   3. reachable only in the window right after an account is created —
//      an account past that window gets a plain refusal, not data.
const MATCH_EXISTING_CONTACTS_MAX_PHONES = 100;
const MATCH_EXISTING_CONTACTS_WINDOW_MS = 24 * 60 * 60_000;

profileRouter.post(
  '/match-existing-contacts',
  authenticateJwt,
  requireUserRole,
  rateLimit({ windowMs: 60 * 60_000, max: 10 }),
  body('phones')
    .isArray({ min: 1, max: MATCH_EXISTING_CONTACTS_MAX_PHONES })
    .withMessage(`phones must be an array of 1-${MATCH_EXISTING_CONTACTS_MAX_PHONES} items`),
  body('phones.*').isString(),
  async (req: Request, res: Response<ApiResponse<{ matches: ExistingContactMatch[] }>>) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({
        success: false,
        error: `phones must be a non-empty array of at most ${MATCH_EXISTING_CONTACTS_MAX_PHONES} items`,
      });
      return;
    }
    try {
      const userId = (req as AuthenticatedRequest).user.userId;
      const created = await query<{ createdAt: string }>(
        'SELECT "createdAt" FROM "User" WHERE id = $1 LIMIT 1',
        [userId],
      );
      const createdAt = created.rows[0]?.createdAt;
      const withinWindow =
        createdAt &&
        Date.now() - new Date(createdAt).getTime() <= MATCH_EXISTING_CONTACTS_WINDOW_MS;
      if (!withinWindow) {
        res.status(403).json({
          success: false,
          error: 'ეს ფუნქცია მხოლოდ რეგისტრაციის დროს არის ხელმისაწვდომი.',
        });
        return;
      }
      const { phones } = req.body as { phones: string[] };
      const matches = await matchExistingContacts(phones);
      res.status(200).json({ success: true, data: { matches } });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[POST /profile/match-existing-contacts]', err);
      res.status(500).json({ success: false, error: 'სერვერის შეცდომა' });
    }
  },
);

export default profileRouter;
