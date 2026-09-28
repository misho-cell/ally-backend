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
 * ⚠️ TWO OF THESE ARE NOT CONFIRMED AND ARE DELIBERATELY ABSENT. Searching by
 * name found exactly one Tornike Abuladze (501) and exactly one Giorgi
 * Turashvili (118509) who uses Netai. „Lika" matched fifteen accounts and
 * „Misho" three, and an outage alarm sent to a stranger is a write to a real
 * person that cannot be taken back. They go in when Misho names the ids, and
 * not before — a list that is three-quarters right is not a list.
 */
export const ALARM_RECIPIENT_IDS: readonly number[] = [501, 118509];

/** Named so a reader of the constant above knows what is missing and why. */
export const ALARM_RECIPIENTS_PENDING = 'Misho and Lika — account ids not yet confirmed';

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
      ORDER BY "userId"`,
    [[...ALARM_RECIPIENT_IDS]],
    8_000,
  );
  return rows.rows.map((r) => ({ userId: r.user_id, phone: r.phone }));
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
