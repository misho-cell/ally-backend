import { query } from '../db/postgres/client';
import { CuriosityUpdate, maybeCuriosityUpdate } from './curiosityQueue.service';

/**
 * #2181, D708 (the founder, 7 Oct; Misho's yes, §98): one question a day about
 * the owner's contacts, really asked. Until now the day's question reached the
 * model only when the model itself called get_pending_updates — three times in
 * nine hours on 7 Oct — and then as „if a natural moment comes up… skipping is
 * fine". Lika, a month on Netai, was never asked once.
 *
 * Now the server hands the day's question to the owner's own run: a regular
 * conversation, the owner present, no goal bound. maybeCuriosityUpdate keeps
 * the once-a-day limit (the surfacing log re-arms it, shared with the tool
 * path), so this section appears in at most one run a day.
 */

/** How each missing core fact is asked about, in Georgian. */
const FACT_QUESTION: Readonly<Record<string, string>> = {
  occupation: 'რას საქმიანობს',
  employer: 'სად მუშაობს',
  city: 'რომელ ქალაქშია',
  industry: 'რა სფეროშია',
};

export interface RunPresence {
  readonly ownerPresent: boolean;
  readonly regularThread: boolean;
  readonly goalBound: boolean;
  readonly preview: boolean;
}

/** Only the owner's own conversation, with the owner there, outside a goal. */
export function contactQuestionMayRun(presence: RunPresence): boolean {
  return (
    presence.ownerPresent && presence.regularThread && !presence.goalBound && !presence.preview
  );
}

/** The prompt section for one due question; '' when it cannot be asked by name. */
export function contactQuestionSection(update: CuriosityUpdate | null): string {
  if (update === null) return '';
  const who = typeof update.payload['who'] === 'string' ? update.payload['who'].trim() : '';
  const fact = String(update.payload['missing_fact'] ?? '');
  const asked = FACT_QUESTION[fact];
  if (who === '' || asked === undefined) return '';
  return (
    '\n\n## დღის ერთი კითხვა მფლობელის კონტაქტზე (D708)\n' +
    `ამ პასუხში, მას შემდეგ რაც მფლობელის დაწერილს უპასუხებ, ჰკითხე ერთი მოკლე კითხვა: ${who} — ${asked}? ` +
    'ერთი წინადადებით უთხარი რატომ: ასე უკეთ მოგიძებნი ხალხს და უკეთ დაგაკავშირებ.\n' +
    'მხოლოდ ეს ერთი კითხვა, ფორმა ან რამდენიმე კითხვა ერთად — არა. პასუხს შემდეგ შეტყობინებაში ' +
    `მოგწერს: მაშინ ${who} სახელით მოძებნე და შეინახე save_contact_fact-ით (field_type: ${fact}). ` +
    'თუ თქვა „ახლა არა", ან არ უნდა, დაანებე თავი და დღეს ამ ადამიანზე აღარ ჰკითხო.'
  );
}

/**
 * 2674: the answer to the day's question can come a line or two later, when
 * the section that asked it is gone — and it went onto the owner's own
 * profile instead of the contact. For two hours after the question, the
 * owner's own run is reminded which contact and which fact are waiting.
 */
const PENDING_ANSWER_HOURS = 2;
const PENDING_QUERY_TIMEOUT_MS = 3_000;

interface PendingQuestion {
  readonly label: string | null;
  readonly missing_fact: string;
}

async function questionAwaitingAnswer(userId: string): Promise<PendingQuestion | null> {
  const result = await query<PendingQuestion>(
    `SELECT (SELECT TRIM(ua.alias) FROM "UserAlias" ua
               WHERE ua."contactId" = l.user_id
                 AND regexp_replace(ua.phone, '\\D', '', 'g') = regexp_replace(l.phone, '\\D', '', 'g')
                 AND NULLIF(TRIM(ua.alias), '') IS NOT NULL
               ORDER BY LENGTH(TRIM(ua.alias)) DESC LIMIT 1) AS label,
            l.missing_fact
       FROM curiosity_surfacing_log l
      WHERE l.user_id = $1::int AND l.surfaced_at > NOW() - make_interval(hours => $2)
      ORDER BY l.surfaced_at DESC LIMIT 1`,
    [userId, PENDING_ANSWER_HOURS],
    PENDING_QUERY_TIMEOUT_MS,
  );
  return result.rows[0] ?? null;
}

/** The reminder for a question already asked today; '' when it cannot name the person. */
export function pendingAnswerSection(pending: PendingQuestion | null): string {
  const who = pending?.label?.trim() ?? '';
  const asked = pending === null ? undefined : FACT_QUESTION[pending.missing_fact];
  if (pending === null || who === '' || asked === undefined) return '';
  return (
    '\n\n## დღეს დასმული კითხვა მფლობელის კონტაქტზე (D708)\n' +
    `დღეს ჰკითხე: ${who} — ${asked}? თუ მფლობელის ეს ან წინა შეტყობინება ამას პასუხობს, ` +
    `${who} სახელით მოძებნე და შეინახე save_contact_fact-ით (field_type: ${pending.missing_fact}) — ` +
    'ამ კონტაქტზე და არასდროს მფლობელის საკუთარ პროფილზე (update_user_profile არა). პასუხში ' +
    'თქვი, რა შეინახე. თუ სხვა რამეს წერს, ეს არ ახსენო.'
  );
}

/** The day's contact question for this run, or '' — never fails the run. */
export async function dailyContactQuestionSection(
  userId: string,
  presence: RunPresence,
): Promise<string> {
  if (!contactQuestionMayRun(presence)) return '';
  try {
    const due = contactQuestionSection(await maybeCuriosityUpdate(userId));
    if (due !== '') return due;
    return pendingAnswerSection(await questionAwaitingAnswer(userId));
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[daily-contact-question] not read:', (err as Error).message);
    return '';
  }
}
