import { query } from '../../db/postgres/client';
import { getOrCreateReferralCode } from '../referralCode.service';

// Engine T11 (ticket 6 task 29, accepted as specced): a personal invite for
// ONE named contact, carrying the user's own referral CODE — never a bare
// link, never a phone number, recorded so it is not offered twice and uptake
// is countable. The assistant asked for an invite tonight and had nothing but
// "the link is on your Profile page" (tester's thread 10000).

const INVITE_TIMEOUT_MS = 8_000;
const APP_URL = 'https://www.netai.guru';

export interface InviteResult {
  success: boolean;
  already_invited?: boolean;
  invited_at?: string;
  invite_text?: string;
  code?: string;
  error?: string;
}

export async function inviteContact(
  userId: string,
  contactPhone: string,
  language: 'ka' | 'en' | 'ru' | 'es' = 'ka',
): Promise<InviteResult> {
  try {
    const phone = contactPhone.trim();
    if (!phone) return { success: false, error: 'Pass the phone id from a search result.' };

    const owned = await query<{ alias: string | null }>(
      `SELECT alias FROM "UserAlias" WHERE "contactId" = $1 AND phone = $2 LIMIT 1`,
      [userId, phone],
      INVITE_TIMEOUT_MS,
    );
    if (owned.rows.length === 0) {
      return { success: false, error: 'ეს ნომერი შენს კონტაქტებში არ არის.' };
    }
    // A member needs no invite — the honest answer, not a duplicate code.
    const member = await query<{ userId: number }>(
      `SELECT "userId" FROM "UserPhone"
       WHERE regexp_replace(phone, '\\D', '', 'g') = regexp_replace($1, '\\D', '', 'g') LIMIT 1`,
      [phone],
      INVITE_TIMEOUT_MS,
    );
    if (member.rows.length > 0) {
      return { success: false, error: 'ეს ადამიანი უკვე Netai-ს წევრია — მოწვევა არ სჭირდება.' };
    }

    const prior = await query<{ created_at: string }>(
      `SELECT created_at FROM invites WHERE user_id = $1 AND contact_phone = $2 LIMIT 1`,
      [userId, phone],
      INVITE_TIMEOUT_MS,
    );
    const code = await getOrCreateReferralCode(userId);
    if (prior.rows.length > 0) {
      return {
        success: true,
        already_invited: true,
        invited_at: prior.rows[0].created_at,
        code,
        invite_text: buildInviteText(code, language),
      };
    }

    await query(
      `INSERT INTO invites (user_id, contact_phone, contact_name, referral_code)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id, contact_phone) DO NOTHING`,
      [userId, phone, owned.rows[0].alias ?? null, code],
      INVITE_TIMEOUT_MS,
    );
    return {
      success: true,
      already_invited: false,
      code,
      invite_text: buildInviteText(code, language),
    };
  } catch (err) {
    // A tool never throws (the 22 Aug FK lesson).
    // eslint-disable-next-line no-console
    console.error('[invite_contact] failed:', (err as Error).message);
    return { success: false, error: 'მოწვევის მომზადება ვერ მოხერხდა — სცადე თავიდან.' };
  }
}

function buildInviteText(code: string, language: 'ka' | 'en' | 'ru' | 'es'): string {
  switch (language) {
    case 'en':
      return `I'm on Netai — a personal network assistant. Join with my invite code ${code} at ${APP_URL}`;
    case 'ru':
      return `Я в Netai — это персональный сетевой ассистент. Присоединяйся с моим кодом ${code}: ${APP_URL}`;
    case 'es':
      return `Estoy en Netai, un asistente personal de red. Únete con mi código ${code} en ${APP_URL}`;
    default:
      return `Netai-ზე ვარ — პირადი ქსელის ასისტენტია. შემოდი ჩემი მოსაწვევი კოდით ${code}: ${APP_URL}`;
  }
}
