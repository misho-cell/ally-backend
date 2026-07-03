import crypto from 'crypto';

// Opaque contact references for the MCP connector. Claude only ever sees
// "c_<token>"; the phone sealed inside never leaves the server, so the privacy
// guarantee is architectural rather than an instruction the model must follow.
// AES-256-GCM with a plaintext-derived IV: deterministic (the same contact
// always yields the same ref for a user, so Claude can correlate results) and
// nonce-safe (distinct plaintexts can never share an IV). The user id is
// sealed in and checked on decode, so a ref minted for one user is useless in
// another user's session.

const REF_PREFIX = 'c_';
const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;
const TAG_BYTES = 16;
const SEPARATOR = '|';

function getKey(): Buffer {
  const secret = process.env.MCP_REF_SECRET ?? process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('MCP_REF_SECRET or JWT_SECRET environment variable must be set');
  }
  return crypto.createHash('sha256').update(secret).digest();
}

export function encodeContactRef(userId: string, phone: string): string {
  const key = getKey();
  const plaintext = Buffer.from(`${userId}${SEPARATOR}${phone}`, 'utf8');
  const iv = crypto.createHmac('sha256', key).update(plaintext).digest().subarray(0, IV_BYTES);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return REF_PREFIX + Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString('base64url');
}

/** Returns the phone sealed in the ref, or null for foreign/tampered/garbage refs. */
export function decodeContactRef(userId: string, ref: string): string | null {
  if (!ref.startsWith(REF_PREFIX)) return null;
  try {
    const raw = Buffer.from(ref.slice(REF_PREFIX.length), 'base64url');
    const iv = raw.subarray(0, IV_BYTES);
    const tag = raw.subarray(IV_BYTES, IV_BYTES + TAG_BYTES);
    const decipher = crypto.createDecipheriv(ALGORITHM, getKey(), iv);
    decipher.setAuthTag(tag);
    const plaintext = Buffer.concat([
      decipher.update(raw.subarray(IV_BYTES + TAG_BYTES)),
      decipher.final(),
    ]).toString('utf8');
    const separatorAt = plaintext.indexOf(SEPARATOR);
    if (separatorAt === -1 || plaintext.slice(0, separatorAt) !== userId) return null;
    return plaintext.slice(separatorAt + 1);
  } catch {
    return null;
  }
}
