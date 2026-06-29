import { NextFunction, Request, Response } from 'express';
import { AuthenticatedRequest } from './auth.middleware';
import { recordDevice } from '../../services/deviceFingerprint.service';

function clientIp(req: Request): string | null {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length > 0) {
    return forwarded.split(',')[0].trim();
  }
  return req.ip ?? null;
}

/**
 * Records the X-Device-Id sent by the app (+ user-agent, IP) for the
 * authenticated user. Best-effort and non-blocking — place after authenticateJwt.
 */
export function captureDeviceFingerprint(req: Request, _res: Response, next: NextFunction): void {
  const user = (req as AuthenticatedRequest).user;
  const deviceId = req.headers['x-device-id'];

  if (user?.userId && typeof deviceId === 'string' && deviceId.trim().length > 0) {
    const userAgent =
      typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'] : null;
    void recordDevice(user.userId, deviceId.trim(), userAgent, clientIp(req)).catch(() => {
      // best-effort: fingerprinting must never break the request
    });
  }

  next();
}
