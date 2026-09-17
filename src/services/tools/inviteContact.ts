import { query } from '../../db/postgres/client';
import { getOrCreateReferralCode } from '../referralCode.service';
import { accountStateFor, fetchAccountStates } from './membership';

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
  /**
   * Ticket 20 row 153 — what KIND of message this is, so the reply can say the
   * true thing about the person rather than „an invitation".
   *
   *   'invite' — no account anywhere; the referral code is the point.
   *   'wake'   — an old Ally account that has never opened Netai. There is
   *              nothing to invite them TO; the message asks them to open it.
   */
  kind?: 'invite' | 'wake';
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
    /**
     * Ticket 20 row 153 — „already a Netai member" was true of an account and
     * false of a person.
     *
     * This asked `UserPhone` whether a ROW exists, which is the one question
     * membership.ts was written to stop anybody asking. Measured by the seat on
     * Lika's threads 16441 and 16442: Giorgi Khatiashvili, user 4511, created
     * 20 March 2024, lastActiveAt null, 127 contacts — an old Ally account that
     * has never opened Netai. The tool told Lika „this person is already a
     * Netai member, no invitation needed", which was untrue to her and left her
     * with nothing to do, and the share button could never appear.
     *
     * D61, and it is the growth story rather than a nicety: waking a dormant
     * old-Ally account is how this network fills. 62,146 such accounts against
     * 42 real users on 3 September — refusing all of them as „members" turns
     * the whole target list into a wall.
     *
     * So the three states get three answers. A NETAI USER is still refused,
     * and now says what to do instead. An ALLY ACCOUNT gets the wake message.
     * Nobody at all gets the invitation with the referral code.
     */
    const states = await fetchAccountStates([phone]);
    const state = accountStateFor(states, phone);
    if (state === 'netai_user') {
      return {
        success: false,
        error:
          'ეს ადამიანი უკვე Netai-ს მომხმარებელია — მოწვევა არ სჭირდება. ' +
          'პირდაპირ ჰკითხე აპიდან.',
      };
    }
    const kind: 'invite' | 'wake' = state === 'ally_account' ? 'wake' : 'invite';

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
        kind,
        invite_text: messageText(kind, code, language),
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
      kind,
      invite_text: messageText(kind, code, language),
    };
  } catch (err) {
    // A tool never throws (the 22 Aug FK lesson).
    // eslint-disable-next-line no-console
    console.error('[invite_contact] failed:', (err as Error).message);
    return { success: false, error: 'მოწვევის მომზადება ვერ მოხერხდა — სცადე თავიდან.' };
  }
}

function messageText(
  kind: 'invite' | 'wake',
  code: string,
  language: 'ka' | 'en' | 'ru' | 'es',
): string {
  return kind === 'wake' ? buildWakeText(language) : buildInviteText(code, language);
}

/**
 * Row 153 — the message for somebody who ALREADY HAS the account.
 *
 * No referral code, because they cannot be referred: the account exists, and a
 * code they cannot use is the kind of detail that makes a message read as
 * machinery. What they are missing is that Netai is there at all, which is the
 * same thing row 203's wake text says („გახსენი Netai").
 */
function buildWakeText(language: 'ka' | 'en' | 'ru' | 'es'): string {
  switch (language) {
    case 'en':
      return `Your Ally account already works on Netai — a personal network assistant. Just open ${APP_URL} and sign in with the same number.`;
    case 'ru':
      return `Твой аккаунт Ally уже работает в Netai — это персональный сетевой ассистент. Просто открой ${APP_URL} и войди с тем же номером.`;
    case 'es':
      return `Tu cuenta de Ally ya funciona en Netai, un asistente personal de red. Abre ${APP_URL} y entra con el mismo número.`;
    default:
      return `შენი Ally-ს ანგარიში უკვე მუშაობს Netai-ზე — პირადი ქსელის ასისტენტია. უბრალოდ გახსენი ${APP_URL} და შედი იმავე ნომრით.`;
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
