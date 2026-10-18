import crypto from 'crypto';
import { query } from '../db/postgres/client';
import { PUBLIC_BASE_URL } from '../config/publicUrl';
import { importContacts, parseVcf } from './contacts.service';
import type { ImportContact } from '../types';

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

/** Every contact already read from the file, in as many rounds as the import's cap needs. */
async function importAll(userId: string, contacts: ImportContact[]): Promise<UploadOutcome> {
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

export interface UploadStarted {
  readonly inFile: number;
}

/**
 * #5842 (the tester's 67519): a part of 300 cards attached in the Claude or
 * ChatGPT chat took about 105 s to save, and a phone's chat would give up on
 * it. A part is now answered as soon as it is read and saved in the
 * background, one part after another per member, so two parts never write at
 * once for the same person and a big file does not open seven imports at the
 * same time.
 */
const partsInLine = new Map<string, Promise<void>>();

/** Reads one part and saves it behind the member's earlier parts. */
export function startImportInBackground(userId: string, vcf: string): UploadStarted {
  const contacts = parseVcf(vcf);
  if (contacts.length === 0) throw new EmptyVcfError('no contacts in the file');
  const earlier = partsInLine.get(userId) ?? Promise.resolve();
  const thisPart = earlier
    .then(() => importAll(userId, contacts))
    .then((outcome) => {
      // eslint-disable-next-line no-console
      console.log(`[contact-file] part of ${outcome.inFile}: ${outcome.imported} new`);
    })
    .catch((err: unknown) => {
      // eslint-disable-next-line no-console
      console.error('[contact-file] background part failed:', (err as Error).message);
    });
  partsInLine.set(userId, thisPart);
  void thisPart.then(() => {
    if (partsInLine.get(userId) === thisPart) partsInLine.delete(userId);
  });
  return { inFile: contacts.length };
}

/**
 * The tester's 67194 (18 Oct): a 1,900-contact file took 10–12 minutes, two to
 * three contacts a second, while the phone page waited on one request — at the
 * event it would time out or be closed. So the page is answered as soon as the
 * file is read, and the contacts load in the background. The load is an
 * import attempt like any other, so a deploy waits for it (ship_one's quiet
 * check). If it fails, the link is given back for another try.
 */
export async function startUploadThroughLink(token: string, vcf: string): Promise<UploadStarted> {
  const userId = await claimLink(token);
  if (userId === null) throw new UploadLinkClosedError('link used or expired');
  const contacts = parseVcf(vcf);
  if (contacts.length === 0) {
    await releaseLink(token);
    throw new EmptyVcfError('no contacts in the file');
  }
  void importAll(userId, contacts)
    .then((outcome) => {
      // eslint-disable-next-line no-console
      console.log(`[contact-upload] ${outcome.inFile} in the file, ${outcome.imported} new`);
    })
    .catch(async (err: unknown) => {
      // eslint-disable-next-line no-console
      console.error('[contact-upload] background load failed:', (err as Error).message);
      await releaseLink(token).catch((releaseErr: unknown) => {
        // eslint-disable-next-line no-console
        console.error('[contact-upload] link not given back:', (releaseErr as Error).message);
      });
    });
  return { inFile: contacts.length };
}
