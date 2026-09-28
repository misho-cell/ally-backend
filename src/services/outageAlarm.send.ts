import { query } from '../db/postgres/client';

/**
 * WHO HEARS THE ALARM, AND HOW IT REACHES THEM.
 *
 * Separate from `outageAlarm.service.ts` on purpose: that file decides WHETHER
 * to speak and remembers that it did, this one only carries the words. A
 * decision that also delivers is a decision nobody can test without sending a
 * message to four real phones.
 *
 * ════════ ⚠️ THE NUMBERS ARE NOT IN THIS FILE AND NEVER WILL BE ════════
 *
 * D149: no file in this repository carries a full phone number. So the
 * recipients are stored as ACCOUNT IDS and the number is read from `UserPhone`
 * at the moment of sending. That is not only the rule — it is also correct:
 * somebody who changes their number changes it in one place, and a list of
 * numbers in a source file would go stale silently and be discovered during an
 * outage, which is the worst possible time.
 *
 * ════════ ⚠️ AND IT CANNOT SEND YET. THIS IS NOT A BUG, IT IS ACCESS. ════════
 *
 * `sendWhatsAppMessage` posts a WhatsApp Business TEMPLATE called `whatsup_otp`
 * with one parameter: a login code. WhatsApp Business permits free text only
 * inside twenty-four hours of the person writing to the business number; the
 * rest of the time it is templates only. So the sender we already own would
 * deliver
 *
 *     „Your code is: Anthropic spend limit reached, 34 goals stalled…"
 *
 * which is wrong for the reader and breaks WhatsApp's own rules besides. I
 * TOLD THE TESTER OTHERWISE — „WhatsApp needs only a yes" — before I had read
 * the function, and that sentence reached the founder and was acted on. This
 * comment is here so the next person does not have to rediscover it.
 *
 * What it needs is ONE approved template in the Meta Business account, and
 * that is somebody's access, not my code. When it exists, set
 * `WHATSAPP_ALERT_TEMPLATE` to its name and this file starts sending with no
 * further change.
 *
 * Until then it REFUSES LOUDLY rather than falling back to the OTP template.
 * A quiet almost-send is how an alarm gets reported as built while being
 * incapable of reaching anybody.
 */

/**
 * The four the founder named — „me, misho, giorgi and lika. to all of us" —
 * and Misho named the same four directly to me the same morning.
 *
 * ⚠️ ONLY THREE ARE HERE, AND THE MISSING ONE IS THE REASON THIS COMMENT IS
 * LONG. The tester gave me all four ids from the admin: 501, 118509, 160584
 * and 167250. I checked each against `UserPhone` before adding it, and
 *
 *     account 167250 („Misho", admin, allyapp email) HAS NO PHONE ROW AT ALL.
 *
 * Adding it would have put a name on this list that can never be reached —
 * `recipientPhones` would skip it silently, every alarm would go to three
 * people while appearing to go to four, and nobody would find out until
 * somebody asked why Misho never gets them. A recipient who cannot be
 * reached is worse than an absent one, because the list itself becomes the
 * lie.
 *
 * It is also almost certainly not his personal account: 167250 is the SHARED
 * pilot login the tester seat reads from, it carries the allyapp email, and
 * it has never recorded a `lastLoginAt`. The two „Misho Tchokhonelidze"
 * accounts that DO carry a phone are 26954 (last login 17 June) and 144942
 * (11 March). I am not guessing between them: an outage alarm to the wrong
 * phone is a write to a real person that cannot be taken back.
 *
 * So Misho goes in when Misho says which account is his.
 */
export const ALARM_RECIPIENT_IDS: readonly number[] = [
  501, // Tornike Abuladze — the founder
  118509, // Giorgi Turashvili
  160584, // Lika Ose (Osepashvili)
];

export const ALARM_RECIPIENTS_PENDING =
  'Misho — 167250 has no phone on record and is the shared pilot login; he must say which account is his';

export type SendOutcome = 'sent' | 'no_template' | 'no_recipients' | 'failed';

/**
 * Read the recipients' numbers at send time, skipping anybody who has none.
 *
 * A person with no `UserPhone` row is not an error and not worth an alarm of
 * its own — they simply cannot be reached this way, and saying so in the log
 * is enough.
 */
async function recipientPhones(): Promise<Array<{ userId: number; phone: string }>> {
  if (ALARM_RECIPIENT_IDS.length === 0) return [];
  const rows = await query<{ user_id: number; phone: string }>(
    `SELECT "userId" AS user_id, phone
       FROM "UserPhone"
      WHERE "userId" = ANY($1::int[])
        AND phone IS NOT NULL AND phone <> ''
      ORDER BY "userId", id`,
    [[...ALARM_RECIPIENT_IDS]],
    8_000,
  );
  /**
   * ⚠️ ONE MESSAGE PER PERSON, NOT PER NUMBER. The founder has TWO `UserPhone`
   * rows, so the obvious mapping would send him every alarm twice — and „the
   * alarm is noisy" is how an alarm gets muted, which is the failure this
   * whole file exists to avoid. The first number per account wins; the rows
   * are ordered so that choice is stable rather than whatever the planner
   * returned that day.
   */
  const firstPerPerson = new Map<number, string>();
  for (const row of rows.rows) {
    if (!firstPerPerson.has(row.user_id)) firstPerPerson.set(row.user_id, row.phone);
  }
  return [...firstPerPerson].map(([userId, phone]) => ({ userId, phone }));
}

/**
 * Send one alarm to everybody on the list.
 *
 * ⚠️ IT RETURNS WHY IT DID NOT SEND, rather than throwing or returning a bare
 * false. „There is no template", „nobody is on the list" and „WhatsApp
 * refused" are three different problems belonging to three different people,
 * and a caller that cannot tell them apart will report the wrong one.
 */
export async function sendOutageAlarm(text: string): Promise<SendOutcome> {
  const template = process.env.WHATSAPP_ALERT_TEMPLATE?.trim();
  if (!template) {
    // eslint-disable-next-line no-console
    console.error(
      '[outage-alarm] CANNOT SEND — no WHATSAPP_ALERT_TEMPLATE is set, and the only ' +
        'template this account owns is `whatsup_otp`, which is a login code and not a ' +
        'sentence. One approved template in the Meta Business account is all that is ' +
        'missing. The message that would have gone: ' +
        text,
    );
    return 'no_template';
  }

  const people = await recipientPhones();
  if (people.length === 0) {
    // eslint-disable-next-line no-console
    console.error('[outage-alarm] CANNOT SEND — nobody on the list has a number on record.');
    return 'no_recipients';
  }

  // The import is deliberately late: `whatsapp.service` throws at load time
  // when its credentials are missing, and an alarm module that cannot even be
  // imported on a misconfigured box is an alarm that fails exactly when things
  // are already wrong.
  const { sendWhatsAppTemplate } = await import('./whatsapp.service');

  let delivered = 0;
  for (const person of people) {
    try {
      await sendWhatsAppTemplate(person.phone, template, [text]);
      delivered += 1;
    } catch (err) {
      // One unreachable phone must not stop the other three being told.
      // eslint-disable-next-line no-console
      console.error(
        `[outage-alarm] could not reach account ${person.userId}:`,
        (err as Error).message,
      );
    }
  }

  // eslint-disable-next-line no-console
  console.log(`[outage-alarm] delivered to ${delivered} of ${people.length} recipient(s)`);
  return delivered > 0 ? 'sent' : 'failed';
}
