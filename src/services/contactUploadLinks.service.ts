import crypto from 'crypto';
import { query } from '../db/postgres/client';
import { PUBLIC_BASE_URL } from '../config/publicUrl';
import { importContacts, parseVcf } from './contacts.service';

/**
 * #5744 (A), the founder's D822: inside Claude or ChatGPT a member asks for a
 * link, opens it on the phone and picks the .vcf file. The file goes straight
 * to Netai — no number passes through the AI. A link is one use, lives
 * LINK_MINUTES, and only its SHA-256 is stored.
 */
const LINK_MINUTES = 30;
const TOKEN_BYTES = 24;
const QUERY_TIMEOUT_MS = 5_000;
export const UPLOAD_PATH = '/contacts-upload';
/** The import takes at most 500 new contacts a call; a 5,000-contact file needs ten. */
const MAX_IMPORT_ROUNDS = 12;

export interface UploadLink {
  readonly url: string;
  readonly expiresAt: string;
}

export interface UploadOutcome {
  readonly imported: number;
  readonly unchanged: number;
  readonly skipped: number;
  readonly inFile: number;
}

function hashOf(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export async function createUploadLink(userId: string): Promise<UploadLink> {
  const token = crypto.randomBytes(TOKEN_BYTES).toString('base64url');
  const result = await query<{ expires_at: string }>(
    `INSERT INTO contact_upload_links (token_hash, user_id, expires_at)
     VALUES ($1, $2, NOW() + make_interval(mins => $3))
     RETURNING expires_at`,
    [hashOf(token), Number(userId), LINK_MINUTES],
    QUERY_TIMEOUT_MS,
  );
  return {
    url: `${PUBLIC_BASE_URL}${UPLOAD_PATH}/${token}`,
    expiresAt: new Date(result.rows[0].expires_at).toISOString(),
  };
}

/** Is the link still good to show its page? It is not used up by looking. */
export async function isUploadLinkOpen(token: string): Promise<boolean> {
  const result = await query(
    `SELECT 1 FROM contact_upload_links
      WHERE token_hash = $1 AND used_at IS NULL AND expires_at > NOW() LIMIT 1`,
    [hashOf(token)],
    QUERY_TIMEOUT_MS,
  );
  return (result.rowCount ?? 0) > 0;
}

/** Takes the link for this upload, once; null when it is used, expired or unknown. */
async function claimLink(token: string): Promise<string | null> {
  const result = await query<{ user_id: number }>(
    `UPDATE contact_upload_links SET used_at = NOW()
      WHERE token_hash = $1 AND used_at IS NULL AND expires_at > NOW()
      RETURNING user_id`,
    [hashOf(token)],
    QUERY_TIMEOUT_MS,
  );
  const row = result.rows[0];
  return row === undefined ? null : String(row.user_id);
}

/** Gives the link back when the upload failed, so the member can try again. */
async function releaseLink(token: string): Promise<void> {
  await query(
    'UPDATE contact_upload_links SET used_at = NULL WHERE token_hash = $1',
    [hashOf(token)],
    QUERY_TIMEOUT_MS,
  );
}

export class UploadLinkClosedError extends Error {}
export class EmptyVcfError extends Error {}

/** Every contact in the file, in as many rounds as the import's cap needs. */
async function importWholeFile(userId: string, vcf: string): Promise<UploadOutcome> {
  const contacts = parseVcf(vcf);
  if (contacts.length === 0) throw new EmptyVcfError('no contacts in the file');
  let imported = 0;
  let unchanged = 0;
  let skipped = 0;
  for (let round = 0; round < MAX_IMPORT_ROUNDS; round += 1) {
    const result = await importContacts(userId, contacts, 'vcf_import');
    imported += result.imported;
    // Later rounds see the earlier rounds' contacts as already saved; the file's own count is the first's.
    if (round === 0) {
      skipped = result.skipped;
      unchanged = result.unchanged ?? 0;
    }
    if ((result.remaining ?? 0) === 0) break;
  }
  return { imported, unchanged, skipped, inFile: contacts.length };
}

export async function uploadThroughLink(token: string, vcf: string): Promise<UploadOutcome> {
  const userId = await claimLink(token);
  if (userId === null) throw new UploadLinkClosedError('link used or expired');
  try {
    return await importWholeFile(userId, vcf);
  } catch (err) {
    await releaseLink(token);
    throw err;
  }
}
