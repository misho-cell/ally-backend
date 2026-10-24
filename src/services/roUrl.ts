/**
 * The read-only URL's parts, read by hand (24 Oct): the rotated password
 * carries characters a URL parser cuts at, so the pool and the status read
 * the URL here, the same way. No database import — the pool's own file uses it.
 */

export const DEFAULT_PG_PORT = '5432';
export const DEFAULT_PG_DB = 'postgres';
/** Characters that end or split the password part of a URL unless percent-encoded. */
export const URL_BREAKING_CHARS = /[@/:#?\s]/;

export interface ParsedRoUrl {
  readonly user: string;
  readonly password: string;
  readonly host: string;
  readonly port: string;
  readonly database: string;
}

/**
 * user:password@host[:port]/database — the password runs to the LAST „@", so
 * one that carries „@ / # ?" or a line break is read whole instead of being
 * cut, or stripped, where a URL parser would.
 */
const RO_URL_RE =
  /^postgres(?:ql)?:\/\/([^:@/]+):([\s\S]*)@([^@/:?#]+)(?::(\d+))?(?:\/([^?#]*))?(?:\?.*)?$/i;

export function rawPasswordOf(url: string): string {
  const afterScheme = url.replace(/^[a-z]+:\/\//i, '');
  const userInfo = afterScheme.slice(0, afterScheme.lastIndexOf('@'));
  const colon = userInfo.indexOf(':');
  return colon < 0 ? '' : userInfo.slice(colon + 1);
}

/** A percent-escaped password is decoded; a raw one (or a bad escape) is taken as written. */
function passwordOf(raw: string): string {
  if (URL_BREAKING_CHARS.test(raw)) return raw;
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

/** The URL's parts, or null when it is not a postgres URL with a user, host and database. */
export function parseRoUrl(url: string): ParsedRoUrl | null {
  const match = RO_URL_RE.exec(url);
  if (match === null) return null;
  const [, user, rawPassword, host, port, database] = match;
  return {
    user,
    password: passwordOf(rawPassword),
    host,
    port: port ?? DEFAULT_PG_PORT,
    database: database || DEFAULT_PG_DB,
  };
}
