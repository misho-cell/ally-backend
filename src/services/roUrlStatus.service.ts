import { createHash, createHmac, pbkdf2Sync, timingSafeEqual } from 'crypto';

import { query } from '../db/postgres/client';
import {
  DEFAULT_PG_DB,
  DEFAULT_PG_PORT,
  URL_BREAKING_CHARS,
  parseRoUrl,
  rawPasswordOf,
} from './roUrl';

/**
 * 24 Oct: after the secret rotation the read-only window answered „password
 * authentication failed for user claude_readonly", and nobody could see why —
 * the URL lives only on Railway and must never be printed. This says what is
 * wrong with it without showing any of it: which parts agree with the main
 * connection, whether the password survives being inside a URL, and whether
 * it is the password the database holds for the role.
 */

const SCRAM_PREFIX = 'SCRAM-SHA-256$';
const SCRAM_KEY_BYTES = 32;
const MD5_PREFIX = 'md5';
const SCHEME_RE = /^([a-z][a-z0-9+.-]*):\/\//i;

/** After the last @ only — the password is before it — letters and digits folded to x. */
function hostPartShape(url: string): string | null {
  const at = url.lastIndexOf('@');
  return at < 0 ? null : url.slice(at + 1).replace(/[\p{L}\p{N}]+/gu, 'x');
}

const QUOTE_CHARS = /^["']|["']$/;

export interface MainConnection {
  readonly host: string | undefined;
  readonly port: string | undefined;
  readonly database: string | undefined;
}

export interface RoUrlStatus {
  readonly configured: boolean;
  /** The part before the scheme separator; never secret. */
  readonly scheme: string | null;
  /** What follows the last @ with letters and digits as x: the host-part shape, no password. */
  readonly host_part_shape: string | null;
  readonly parses: boolean;
  readonly quoted: boolean;
  readonly user: string | null;
  readonly same_host_as_main: boolean | null;
  readonly same_port_as_main: boolean | null;
  readonly same_db_as_main: boolean | null;
  readonly password_set: boolean;
  readonly password_url_safe: boolean | null;
  /** null when the main role may not read the stored password (not a superuser). */
  readonly password_matches_db: boolean | null;
}

function sameText(a: string, b: string | undefined): boolean | null {
  return b === undefined ? null : a.toLowerCase() === b.toLowerCase();
}

function equalBytes(a: Buffer, b: Buffer): boolean {
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Postgres's own SCRAM check: StoredKey = SHA256(HMAC(SaltedPassword, "Client Key")). */
export function scramMatches(password: string, stored: string): boolean {
  const match = /^SCRAM-SHA-256\$(\d+):([^$]+)\$([^:]+):(.+)$/.exec(stored);
  if (match === null) return false;
  const [, iterations, salt, storedKey] = match;
  const salted = pbkdf2Sync(
    password,
    Buffer.from(salt, 'base64'),
    Number(iterations),
    SCRAM_KEY_BYTES,
    'sha256',
  );
  const clientKey = createHmac('sha256', salted).update('Client Key').digest();
  const computed = createHash('sha256').update(clientKey).digest();
  return equalBytes(computed, Buffer.from(storedKey, 'base64'));
}

export function md5Matches(password: string, user: string, stored: string): boolean {
  const computed =
    MD5_PREFIX +
    createHash('md5')
      .update(password + user)
      .digest('hex');
  return equalBytes(Buffer.from(computed), Buffer.from(stored));
}

export function passwordMatchesStored(password: string, user: string, stored: string): boolean {
  if (stored.startsWith(SCRAM_PREFIX)) return scramMatches(password, stored);
  if (stored.startsWith(MD5_PREFIX)) return md5Matches(password, user, stored);
  return false;
}

/** The role's stored verifier; null when this role may not read pg_authid. */
async function storedPasswordOf(user: string): Promise<string | null> {
  try {
    const result = await query<{ rolpassword: string | null }>(
      'SELECT rolpassword FROM pg_authid WHERE rolname = $1 LIMIT 1',
      [user],
    );
    return result.rows[0]?.rolpassword ?? null;
  } catch (err) {
    if ((err as { code?: string }).code === '42501') return null;
    throw err;
  }
}

export function describeRoUrl(url: string | undefined, main: MainConnection): RoUrlStatus {
  const trimmed = url?.trim() ?? '';
  const quoted = QUOTE_CHARS.test(trimmed);
  const parsed = trimmed ? parseRoUrl(trimmed) : null;
  return {
    configured: trimmed.length > 0,
    scheme: SCHEME_RE.exec(trimmed)?.[1] ?? null,
    host_part_shape: hostPartShape(trimmed),
    parses: parsed !== null,
    quoted,
    user: parsed?.user ?? null,
    same_host_as_main: parsed ? sameText(parsed.host, main.host) : null,
    same_port_as_main: parsed ? sameText(parsed.port, main.port ?? DEFAULT_PG_PORT) : null,
    same_db_as_main: parsed ? sameText(parsed.database, main.database ?? DEFAULT_PG_DB) : null,
    password_set: (parsed?.password.length ?? 0) > 0,
    password_url_safe: trimmed ? !URL_BREAKING_CHARS.test(rawPasswordOf(trimmed)) : null,
    password_matches_db: null,
  };
}

export async function roUrlStatus(
  url: string | undefined,
  main: MainConnection,
): Promise<RoUrlStatus> {
  const described = describeRoUrl(url, main);
  const parsed = described.parses ? parseRoUrl((url ?? '').trim()) : null;
  if (parsed === null || !parsed.password) return described;
  const stored = await storedPasswordOf(parsed.user);
  if (stored === null) return described;
  return {
    ...described,
    password_matches_db: passwordMatchesStored(parsed.password, parsed.user, stored),
  };
}
