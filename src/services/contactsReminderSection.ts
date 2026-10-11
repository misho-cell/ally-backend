import { query } from '../db/postgres/client';
import { SYNC_REMINDER_DAYS } from './contactSyncReminder';
import { contactQuestionMayRun, RunPresence } from './dailyContactQuestion';

/**
 * BJ (D771; §128, Misho's „ყველა კი", 11 Oct): once a month the owner's own
 * run asks, in the assistant's own words, for the contacts saved since the
 * last import — only for someone whose reminder switch is on and whose last
 * real import is over 30 days old, in a regular conversation with no goal,
 * like the day's question. It shares BH's monthly mark
 * (contact_import_reminded_at), so a person is reminded once a month, by push
 * or in chat, never both.
 */
const QUERY_TIMEOUT_MS = 4_000;

/** The approved section, word for word (NIGHT_QUESTIONS BJ). */
export const CONTACTS_REMINDER_SECTION =
  '\n\n## კონტაქტების განახლება (D771)\n' +
  'ამ პასუხში, მას შემდეგ რაც მფლობელის დაწერილს უპასუხებ, შენი სიტყვებით და შენი ტონით სთხოვე, ' +
  'ტელეფონში ახლად შენახული ადამიანები Netai-ში ატვირთოს, და ერთი წინადადებით უთხარი რატომ: რაც მეტი ' +
  'კონტაქტი გაქვს, მით უკეთ შეძლებ მის დახმარებას — მისთვისაც და ყველასთვის. ერთხელ, მოკლედ, ღილაკის გარეშე.';

/** Claims this month's reminder for the owner when it is due; false when it is not (or the read fails). */
async function claimMonthlyReminder(userId: string): Promise<boolean> {
  try {
    const result = await query<{ id: number }>(
      `UPDATE "User" u SET contact_import_reminded_at = NOW()
        WHERE u.id = $1::int AND u.contact_import_reminder
          AND (u.contact_import_reminded_at IS NULL
               OR u.contact_import_reminded_at < NOW() - make_interval(days => $2))
          AND (SELECT MAX(ia.created_at) FROM import_attempts ia
                WHERE ia.user_id = u.id AND ia.imported > 0 AND NOT ia.in_progress)
              < NOW() - make_interval(days => $2)
        RETURNING u.id`,
      [userId, SYNC_REMINDER_DAYS],
      QUERY_TIMEOUT_MS,
    );
    return result.rows.length > 0;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(`[contacts-reminder] user ${userId}:`, (err as Error).message);
    return false;
  }
}

/**
 * The section for this run, or ''. Never beside the day's question: one side
 * request per reply, and the reminder waits for another run.
 */
export async function contactsReminderSection(
  userId: string,
  presence: RunPresence,
  dayQuestionShown: boolean,
): Promise<string> {
  if (dayQuestionShown || !contactQuestionMayRun(presence)) return '';
  return (await claimMonthlyReminder(userId)) ? CONTACTS_REMINDER_SECTION : '';
}
