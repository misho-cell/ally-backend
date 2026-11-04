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
  /** #8713 part 3: the box on the sign-up form, ticked when the member signed up. */
  Signup = 'signup',
}

export interface WhatsAppConsent {
  readonly opted_in: boolean;
  readonly opted_in_at: string | null;
  readonly opted_out_at: string | null;
  /** When Netai's welcome went out in WhatsApp; null when it never has. */
  readonly welcome_sent_at: string | null;
  /** #8713: notifications go to WhatsApp only, not to the app as well. */
  readonly whatsapp_only: boolean;
}

const NEVER_CHOSEN: WhatsAppConsent = {
  opted_in: false,
  opted_in_at: null,
  opted_out_at: null,
  welcome_sent_at: null,
  whatsapp_only: false,
};

const CONSENT_COLUMNS = 'opted_in, opted_in_at, opted_out_at, welcome_sent_at, whatsapp_only';

export async function whatsappConsentOf(userId: number): Promise<WhatsAppConsent> {
  const result = await query<WhatsAppConsent>(
    `SELECT ${CONSENT_COLUMNS} FROM whatsapp_consent WHERE user_id = $1 LIMIT 1`,
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
     RETURNING ${CONSENT_COLUMNS}`,
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

/**
 * #8713 part 2 (Tornike, 4 Nov): WhatsApp only, or the app as well. Null when
 * the member has not chosen WhatsApp: there is nothing to make „only".
 */
export async function setWhatsappOnly(
  userId: number,
  only: boolean,
): Promise<WhatsAppConsent | null> {
  const result = await query<WhatsAppConsent>(
    `UPDATE whatsapp_consent SET whatsapp_only = $2, updated_at = NOW()
      WHERE user_id = $1 AND opted_in = TRUE
      RETURNING ${CONSENT_COLUMNS}`,
    [userId, only],
    QUERY_TIMEOUT_MS,
  );
  return result.rows[0] ?? null;
}

/** True for a member who chose WhatsApp and WhatsApp only. Fails towards false (the app keeps notifying). */
export async function notifiesOnlyInWhatsapp(userId: number): Promise<boolean> {
  try {
    const consent = await whatsappConsentOf(userId);
    return consent.opted_in && consent.whatsapp_only;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(`[whatsapp] only-setting of ${userId} not read:`, (err as Error).message);
    return false;
  }
}
