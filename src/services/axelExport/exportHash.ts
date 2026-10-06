import crypto from 'crypto';
import { phoneDigits } from '../phone';

/**
 * The Axel export (Misho's word, 6 Oct; the founder's request of 11:22): every
 * phone number is replaced by one stable hash, so the same number reads the
 * same in every file and overlaps can be counted without the numbers.
 *
 * KEYED, NOT A PLAIN DIGEST. A Georgian mobile number has about 10^9 values;
 * a plain SHA-256 of one is reversed by trying them all in minutes. The key is
 * derived from the server secret the contact references already use
 * (mcp/contactRef.ts), with its own label so no other use of that secret can
 * ever produce the same value. A rotation of that secret changes every hash —
 * stated in the data dictionary.
 */
const HASH_LABEL = 'netai-export-phone-hash-v1|';
const HASH_HEX_CHARS = 24;

function exportKey(): Buffer {
  const secret = process.env.MCP_REF_SECRET ?? process.env.JWT_SECRET;
  if (!secret) throw new Error('MCP_REF_SECRET or JWT_SECRET must be set for the export hash');
  return crypto
    .createHash('sha256')
    .update(HASH_LABEL + secret)
    .digest();
}

/** '' for no number; otherwise the same 24 hex characters for the same digits, always. */
export function exportPhoneHash(raw: string | null | undefined): string {
  const digits = phoneDigits(raw);
  if (digits === '') return '';
  return crypto
    .createHmac('sha256', exportKey())
    .update(digits)
    .digest('hex')
    .slice(0, HASH_HEX_CHARS);
}
