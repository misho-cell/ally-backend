import { query } from '../db/postgres/client';

/**
 * Misho, 25 Oct: users struggle to see the app's notifications and use
 * WhatsApp more, so a person may choose to get Netai's messages there. The
 * choice is theirs alone, made from the profile and taken back the same way;
 * nothing goes to WhatsApp for anyone who has not chosen it.
 */
const QUERY_TIMEOUT_MS = 4_000;

export enum ConsentSource {
  Profile = 'profile',
  WhatsAppStop = 'whatsapp_stop',
}

export interface WhatsAppConsent {
  readonly opted_in: boolean;
  readonly opted_in_at: string | null;
  readonly opted_out_at: string | null;
}

const NEVER_CHOSEN: WhatsAppConsent = { opted_in: false, opted_in_at: null, opted_out_at: null };

export async function whatsappConsentOf(userId: number): Promise<WhatsAppConsent> {
  const result = await query<WhatsAppConsent>(
    `SELECT opted_in, opted_in_at, opted_out_at FROM whatsapp_consent WHERE user_id = $1 LIMIT 1`,
    [userId],
    QUERY_TIMEOUT_MS,
  );
  return result.rows[0] ?? NEVER_CHOSEN;
}

/** Records the person's choice, with when and where they made it. */
export async function setWhatsappConsent(
  userId: number,
  optedIn: boolean,
  source: ConsentSource,
): Promise<WhatsAppConsent> {
  const result = await query<WhatsAppConsent>(
    `INSERT INTO whatsapp_consent (user_id, opted_in, opted_in_at, opted_out_at, source, updated_at)
     VALUES ($1, $2, CASE WHEN $2 THEN NOW() END, CASE WHEN NOT $2 THEN NOW() END, $3, NOW())
     ON CONFLICT (user_id) DO UPDATE SET
       opted_in     = EXCLUDED.opted_in,
       opted_in_at  = CASE WHEN EXCLUDED.opted_in THEN NOW() ELSE whatsapp_consent.opted_in_at END,
       opted_out_at = CASE WHEN EXCLUDED.opted_in THEN whatsapp_consent.opted_out_at ELSE NOW() END,
       source       = EXCLUDED.source,
       updated_at   = NOW()
     RETURNING opted_in, opted_in_at, opted_out_at`,
    [userId, optedIn, source],
    QUERY_TIMEOUT_MS,
  );
  return result.rows[0];
}

/** True only for a person who has chosen WhatsApp and not taken it back. Fails towards false. */
export async function hasWhatsappConsent(userId: number): Promise<boolean> {
  try {
    return (await whatsappConsentOf(userId)).opted_in;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(`[whatsapp] consent of ${userId} not read:`, (err as Error).message);
    return false;
  }
}
