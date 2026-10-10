import { query } from '../db/postgres/client';

const MAX_FIELD = 256;
const QUERY_TIMEOUT_MS = 5_000;

/**
 * Record (or update) a device seen for a user. Best-effort: callers invoke
 * this fire-and-forget so it never blocks or fails a request.
 */
/** A build code as the app writes it: letters, digits, dot, dash, underscore. */
const APP_BUILD_RE = /^[A-Za-z0-9._-]{1,40}$/;

/** The app's build code from its header, or null when absent or not one. */
export function appBuildOf(header: unknown): string | null {
  return typeof header === 'string' && APP_BUILD_RE.test(header.trim()) ? header.trim() : null;
}

export async function recordDevice(
  userId: string,
  deviceId: string,
  userAgent: string | null,
  ip: string | null,
  appBuild: string | null = null,
): Promise<void> {
  await query(
    `INSERT INTO device_fingerprints (user_id, device_id, user_agent, ip, app_build)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (user_id, device_id)
     DO UPDATE SET request_count = device_fingerprints.request_count + 1,
                   last_seen     = NOW(),
                   user_agent    = EXCLUDED.user_agent,
                   ip            = EXCLUDED.ip,
                   app_build     = COALESCE(EXCLUDED.app_build, device_fingerprints.app_build)`,
    [userId, deviceId.slice(0, MAX_FIELD), userAgent?.slice(0, MAX_FIELD) ?? null, ip, appBuild],
    QUERY_TIMEOUT_MS,
  );
}

const BUILD_REPORT_DAYS = 7;
const MAX_BUILDS_LISTED = 50;

export interface BuildUse {
  readonly app_build: string | null;
  readonly people: number;
  readonly devices: number;
}

/**
 * 4298 (plate NEW-7): per app build, how many people used it in the last
 * seven days — by the build each device was last seen with. A null build is
 * the app before it sent the header.
 */
export async function appBuildsInUse(): Promise<BuildUse[]> {
  const result = await query<BuildUse>(
    `SELECT app_build, COUNT(DISTINCT user_id)::int AS people, COUNT(*)::int AS devices
       FROM device_fingerprints
      WHERE last_seen > NOW() - make_interval(days => $1)
      GROUP BY app_build
      ORDER BY people DESC
      LIMIT $2`,
    [BUILD_REPORT_DAYS, MAX_BUILDS_LISTED],
    QUERY_TIMEOUT_MS,
  );
  return result.rows;
}
