import { Router, Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import {
  authenticateJwt,
  requireUserRole,
  AuthenticatedRequest,
} from '../middleware/auth.middleware';
import { query } from '../../db/postgres/client';
import { ApiResponse } from '../../types';

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

      res.status(200).json({ success: true, data: row });
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

export default profileRouter;
