import { NextFunction, Request, Response } from 'express';
import { noteAppActivity } from '../../services/appSessions.service';
import { dueForRecording, signedInUserId } from './deviceFingerprint.middleware';

/**
 * #7888: every signed-in request the APP makes extends the person's session.
 * The app is told apart by its X-Device-Id header, which the Claude/ChatGPT
 * connector does not send. The push receipt is the service worker answering a
 * push with the app closed, so it is not a session. Written at most once a
 * minute per person; best-effort, it never answers or fails a request.
 */
const NOT_A_SESSION_PATHS: ReadonlySet<string> = new Set(['/notifications/receipt']);
const SESSION_KEY_PREFIX = 'session|';

export function trackAppSession(req: Request, _res: Response, next: NextFunction): void {
  const deviceId = req.headers['x-device-id'];
  const fromTheApp = typeof deviceId === 'string' && deviceId.trim().length > 0;
  const userId = fromTheApp && !NOT_A_SESSION_PATHS.has(req.path) ? signedInUserId(req) : null;
  if (userId !== null && dueForRecording(`${SESSION_KEY_PREFIX}${userId}`, Date.now())) {
    void noteAppActivity(userId).catch((error: unknown) => {
      // eslint-disable-next-line no-console
      console.warn(
        `[session] not recorded: ${error instanceof Error ? error.message : String(error)}`,
      );
    });
  }
  next();
}
