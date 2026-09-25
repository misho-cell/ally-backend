import { Router, Request, Response } from 'express';
import multer from 'multer';

import {
  authenticateJwt,
  requireUserRole,
  AuthenticatedRequest,
} from '../middleware/auth.middleware';
import { rateLimit } from '../middleware/rateLimit.middleware';
import { ApiResponse } from '../../types';
import { transcribe, MAX_AUDIO_BYTES, MAX_AUDIO_MS } from '../../services/speech.service';

/**
 * `POST /speech/transcribe` — row 226, the iPhone half.
 *
 * Built to the app team's written spec rather than to my idea of it: multipart,
 * the exact `mimeType` MediaRecorder handed them (trusted over any extension),
 * a language HINT, an optional thread id, 60 seconds and 5 MB, one blob and
 * one answer with no streaming in the first version, and — the part they asked
 * for most plainly — NAMED failures instead of an empty string and a 200.
 *
 * Their words, and they are the reason this file has five refusal names in it:
 * „an empty text and a 200 is the same trap `catch {}` was — „I heard nothing"
 * and „I could not try" are not the same thing, and I have to tell a person
 * different things."
 *
 * ⚠️ IT SPENDS MONEY WHEN IT IS ON, so it is off. `SPEECH_TO_TEXT_ENABLED`
 * defaults to unset and every call answers `not_enabled` until Misho or the
 * founder says otherwise. The app team can build and test the whole path
 * against that answer without one paid call.
 */
const speechRouter = Router();

// `requireUserRole` beside the JWT, as every user-facing router here does: an
// admin token left in shared client storage would otherwise transcribe onto
// the admin's own account, which is the „search returns nothing after using
// the configurator" class of bug wearing a microphone.
speechRouter.use(authenticateJwt, requireUserRole);
/**
 * Tighter than the ordinary limits, and on purpose: every call that gets
 * through costs money per minute of audio. A runaway client must be a small
 * bill and not a large one.
 */
speechRouter.use(rateLimit({ windowMs: 60_000, max: 20 }));

/**
 * In memory, never on disk. The audio is somebody's voice: it is held for the
 * length of one request, handed to the recogniser, and dropped. Nothing about
 * it is written down here — not the bytes, not the text, not the thread.
 */
const upload = multer({
  storage: multer.memoryStorage(),
  // multer's own ceiling, so an oversized body is refused before it is all in
  // memory rather than after. The service checks the same bound again.
  limits: { fileSize: MAX_AUDIO_BYTES, files: 1, fields: 8 },
});

/** One place, so the route and the docs cannot drift apart. */
const REFUSAL_STATUS: Record<string, number> = {
  not_enabled: 503,
  // A ceiling reached, not a fault: 429 so a client can tell „come back
  // tomorrow" apart from „this is broken".
  daily_limit: 429,
  too_long: 413,
  too_large: 413,
  unsupported_format: 415,
  no_speech: 422,
  recognizer_failed: 502,
};

interface TranscribeBody {
  mime?: string;
  language?: string;
  duration_ms?: string;
  thread_id?: string;
}

speechRouter.post(
  '/transcribe',
  (req: Request, res: Response, next: (err?: unknown) => void): void => {
    upload.single('audio')(req, res, (err: unknown) => {
      if (err) {
        // A body over the ceiling arrives here, not in the handler. It is a
        // refusal with a name, exactly like the others — never a 500.
        const tooBig = (err as { code?: string }).code === 'LIMIT_FILE_SIZE';
        res.status(tooBig ? 413 : 400).json({
          success: false,
          error: tooBig ? 'too_large' : 'bad_upload',
        });
        return;
      }
      next();
    });
  },
  async (req: Request, res: Response<ApiResponse<unknown>>): Promise<void> => {
    const userId = (req as AuthenticatedRequest).user.userId;
    const file = (req as Request & { file?: { buffer: Buffer; mimetype?: string } }).file;
    const body = req.body as TranscribeBody;

    if (!file || file.buffer.byteLength === 0) {
      res.status(400).json({ success: false, error: 'bad_upload' });
      return;
    }
    // Their instruction, word for word: trust the `mime` field they send and
    // not the extension. multer's own mimetype is the fallback, never the
    // first choice.
    const mime = (body.mime ?? file.mimetype ?? '').trim();
    if (mime === '') {
      res.status(400).json({ success: false, error: 'unsupported_format' });
      return;
    }
    const durationRaw = Number(body.duration_ms);
    const durationMs = Number.isFinite(durationRaw) && durationRaw > 0 ? durationRaw : undefined;

    try {
      const outcome = await transcribe({
        userId: String(userId),
        audio: file.buffer,
        mime,
        language: (body.language ?? '').trim() || undefined,
        durationMs,
      });
      if (!outcome.ok) {
        // The reason is the payload. A phone showing „could not understand"
        // when the truth is „we never tried" is the bug this shape prevents.
        // eslint-disable-next-line no-console
        console.warn(
          `[speech] user ${userId}: ${outcome.reason}` +
            `${outcome.detail ? ` (${outcome.detail})` : ''} — ` +
            `${file.buffer.byteLength} bytes`,
        );
        res
          .status(REFUSAL_STATUS[outcome.reason] ?? 400)
          .json({ success: false, error: outcome.reason });
        return;
      }
      // ⚠️ THE TEXT IS NOT LOGGED. It is a person speaking, and a voice note
      // in a log file is the same mistake as a phone number in one.
      // eslint-disable-next-line no-console
      console.log(`[speech] user ${userId}: ${outcome.text.length} chars from ${mime}`);
      res.status(200).json({
        success: true,
        data: { text: outcome.text, language: outcome.language },
      });
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('[speech] route failed:', (error as Error).message);
      res.status(500).json({ success: false, error: 'სერვერის შეცდომა' });
    }
  },
);

/**
 * So the client can draw the right waiting state and the right ceilings
 * without either side hardcoding a number the other might change.
 */
speechRouter.get('/limits', (_req: Request, res: Response<ApiResponse<unknown>>): void => {
  res.status(200).json({
    success: true,
    data: {
      max_bytes: MAX_AUDIO_BYTES,
      max_duration_ms: MAX_AUDIO_MS,
      /** What to wait before giving up and saying so. */
      timeout_ms: 45_000,
      accepted: ['audio/mp4', 'audio/webm', 'audio/ogg', 'audio/wav', 'audio/mpeg'],
      enabled: process.env.SPEECH_TO_TEXT_ENABLED?.trim() === 'true',
    },
  });
});

export default speechRouter;
