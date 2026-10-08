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
  city: 'რომელ ქალაქში ცხოვრობს',
  industry: 'რა სფეროშია',
};

export interface RunPresence {
  readonly ownerPresent: boolean;
  readonly regularThread: boolean;
  readonly goalBound: boolean;
  readonly preview: boolean;
  /** 2938: the owner's line is about the owner („რისი ცოდნა გინდა ჩემზე?"). */
  readonly ownerAsksAboutSelf?: boolean;
  /** 3434: the owner's line tells of a death. */
  readonly ownerSpeaksOfADeath?: boolean;
  /** 3367: the owner's line asks what is waiting or what is new. */
  readonly ownerAsksWhatWaits?: boolean;
}

/**
 * 2938 (the tester's 45871, conv 44344): „რისი ცოდნა გინდა ჩემზე?" — the run
 * fetched the profile question, and the owner read the day's CONTACT question
 * with the profile question's buttons under it. A reply about the owner is not
 * the place for a question about someone else; it waits for another reply.
 */
const ABOUT_THE_OWNER_RE =
  /(ჩემზე|ჩემ(?:ს)?\s+შესახებ|\babout\s+(?:me|myself)\b|обо\s+мне|sobre\s+m[ií])/iu;

export function asksAboutTheOwner(ownerLine: string): boolean {
  return ABOUT_THE_OWNER_RE.test(ownerLine);
}

/**
 * 3434 (the tester's 46678, 1 of 2): after „<name> გარდაიცვალა…" the reply's
 * condolence was followed by „სხვათა შორის, <another contact> სად მუშაობს?".
 * A line about a death is never the moment for the day's light question.
 */
const SPEAKS_OF_A_DEATH_RE =
  /(გარდაიცვალ|გარდაცვლილ|დაიღუპ|\bdied\b|passed\s+away|\bdeceased\b|умер|скончал|falleci|murió)/iu;

export function speaksOfADeath(ownerLine: string): boolean {
  return SPEAKS_OF_A_DEATH_RE.test(ownerLine);
}

/**
 * 3367 (the tester's 47065, conv 45693): „რა მელოდება?" on a seat whose only
 * waiting thing was its own goal — the server card named the goal, and the
 * model's whole reply was the day's „სხვათა შორის, … სად მუშაობს?". An owner
 * asking what waits for them is answered with that, and nothing else.
 */
const ASKS_WHAT_WAITS_RE =
  /(რა\s+მელოდება|რა\s+არის\s+ახალი|რა\s+ხდება\s+ახალი|ვინმე\s+მეკითხება|what(?:'s|\s+is)\s+(?:waiting|new)|anything\s+(?:waiting|new)|что\s+нового|что\s+меня\s+ждёт|qué\s+hay\s+de\s+nuevo)/iu;

export function asksWhatWaits(ownerLine: string): boolean {
  return ASKS_WHAT_WAITS_RE.test(ownerLine);
}

/** Only the owner's own conversation, with the owner there, outside a goal. */
export function contactQuestionMayRun(presence: RunPresence): boolean {
  return (
    presence.ownerPresent &&
    presence.regularThread &&
    !presence.goalBound &&
    !presence.preview &&
    presence.ownerAsksAboutSelf !== true &&
    presence.ownerSpeaksOfADeath !== true &&
    presence.ownerAsksWhatWaits !== true
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
    // 3202 (c), Misho's yes, 8 Oct (§103): a light side question, not a reason to answer it.
    `ამ პასუხში, მას შემდეგ რაც მფლობელის დაწერილს უპასუხებ, ბოლოს მსუბუქად, სხვათა შორის ჰკითხე: ` +
    `„სხვათა შორის, ${who} ${asked}? თუ არ იცი, არა უშავს." — ახსნის გარეშე.\n` +
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
  readonly id: number;
  readonly label: string | null;
  readonly missing_fact: string;
}

async function questionAwaitingAnswer(userId: string): Promise<PendingQuestion | null> {
  const result = await query<PendingQuestion>(
    `SELECT l.id,
            (SELECT TRIM(ua.alias) FROM "UserAlias" ua
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

/**
 * The tester's 45676: the day's question is logged the moment it is handed to
 * a run, and the run can drop it — a search reply that ends on its own
 * question („which city?") asked nothing about the contact on two seats of
 * three, and the day's question was spent. Asked means written: when no reply
 * of the owner's since names the contact, and no other conversation of theirs
 * is still working on it, the log row is taken back so this run gets the
 * question again.
 */
/** Letters a declined name may change at its end (ზვიადი → ზვიადს). */
const NAME_ENDING_LETTERS = 1;
const SHORTEST_STEMMED_NAME = 5;

/** The part of the contact's first name every case form of it keeps. */
export function nameStem(label: string): string {
  const first = label.trim().split(/\s+/u)[0] ?? '';
  const letters = Array.from(first);
  return letters.length >= SHORTEST_STEMMED_NAME
    ? letters.slice(0, -NAME_ENDING_LETTERS).join('')
    : first;
}

async function questionWentUnasked(
  userId: string,
  threadId: number,
  pending: PendingQuestion,
): Promise<boolean> {
  const who = nameStem(pending.label ?? '');
  if (who === '') return false;
  const result = await query<{ unasked: boolean }>(
    `SELECT NOT EXISTS (
              SELECT 1 FROM conversations c, curiosity_surfacing_log l
               WHERE l.id = $3 AND c.user_id = $1::int AND c.role = 'assistant'
                 AND c.created_at > l.surfaced_at AND position($4 IN c.content) > 0)
        AND NOT EXISTS (
              SELECT 1 FROM threads t
               WHERE t.user_id = $1::int AND t.id <> $2 AND t.status = 'working') AS unasked`,
    [userId, threadId, pending.id, who],
    PENDING_QUERY_TIMEOUT_MS,
  );
  return result.rows[0]?.unasked === true;
}

async function rearmQuestion(questionId: number): Promise<void> {
  await query(
    'DELETE FROM curiosity_surfacing_log WHERE id = $1',
    [questionId],
    PENDING_QUERY_TIMEOUT_MS,
  );
}

/** The question already handed out today: re-armed when it went unasked, else the reminder. */
async function questionAlreadyHandedOut(userId: string, threadId: number): Promise<string> {
  const pending = await questionAwaitingAnswer(userId);
  if (pending === null) return '';
  if (!(await questionWentUnasked(userId, threadId, pending))) return pendingAnswerSection(pending);
  await rearmQuestion(pending.id);
  return contactQuestionSection(await maybeCuriosityUpdate(userId));
}

/** The day's contact question for this run, or '' — never fails the run. */
export async function dailyContactQuestionSection(
  userId: string,
  threadId: number | undefined,
  presence: RunPresence,
): Promise<string> {
  if (!contactQuestionMayRun(presence)) return '';
  try {
    const due = contactQuestionSection(await maybeCuriosityUpdate(userId));
    if (due !== '' || threadId === undefined) return due;
    return await questionAlreadyHandedOut(userId, threadId);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[daily-contact-question] not read:', (err as Error).message);
    return '';
  }
}
