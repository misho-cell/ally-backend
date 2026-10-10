import { NextFunction, Request, Response } from 'express';
import { verifyToken } from '../../services/auth.service';
import { appBuildOf, recordDevice } from '../../services/deviceFingerprint.service';

const BEARER_PREFIX = 'Bearer ';
const USER_ROLE = 'user';

/**
 * 4298 (tester box 51104): a device is written at most once a minute per build.
 * Every signed-in request now passes here, and the app polls; a new build is
 * written at once because it is a new key. `request_count` therefore counts
 * these writes, not every request.
 */
const RECORD_EVERY_MS = 60_000;
/** Past this many devices the memory starts afresh; the cost is one extra write each. */
const MAX_DEVICES_REMEMBERED = 10_000;
const lastRecorded = new Map<string, number>();

function clientIp(req: Request): string | null {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length > 0) {
    return forwarded.split(',')[0].trim();
  }
  return req.ip ?? null;
}

/** The signed-in person's id when the request carries a valid user token; null otherwise. */
function signedInUserId(req: Request): string | null {
  const header = req.headers.authorization;
  if (typeof header !== 'string' || !header.startsWith(BEARER_PREFIX)) return null;
  try {
    const payload = verifyToken(header.slice(BEARER_PREFIX.length));
    return payload.role === USER_ROLE ? payload.userId : null;
  } catch {
    // An invalid token is the route's own 401 to give; here it only means „not recorded".
    return null;
  }
}

/** True when this device and build were not written within the last minute; marks them written. */
export function dueForRecording(key: string, nowMs: number): boolean {
  const last = lastRecorded.get(key);
  if (last !== undefined && nowMs - last < RECORD_EVERY_MS) return false;
  if (lastRecorded.size >= MAX_DEVICES_REMEMBERED) lastRecorded.clear();
  lastRecorded.set(key, nowMs);
  return true;
}

/**
 * Records the X-Device-Id (+ X-App-Build, user-agent, IP) of every signed-in
 * request, on every route. 4298: it used to run on /threads and /contacts
 * only, so a build seen elsewhere was never counted. Best-effort and
 * non-blocking: it never answers or fails a request.
 */
export function captureDeviceFingerprint(req: Request, _res: Response, next: NextFunction): void {
  const deviceId = req.headers['x-device-id'];
  const userId =
    typeof deviceId === 'string' && deviceId.trim().length > 0 ? signedInUserId(req) : null;

  if (userId !== null && typeof deviceId === 'string') {
    const appBuild = appBuildOf(req.headers['x-app-build']);
    if (dueForRecording(`${userId}|${deviceId.trim()}|${appBuild ?? ''}`, Date.now())) {
      const userAgent =
        typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'] : null;
      void recordDevice(userId, deviceId.trim(), userAgent, clientIp(req), appBuild).catch(
        (error: unknown) => {
          // eslint-disable-next-line no-console
          console.warn(
            `[device] not recorded: ${error instanceof Error ? error.message : String(error)}`,
          );
        },
      );
    }
  }

  next();
}
