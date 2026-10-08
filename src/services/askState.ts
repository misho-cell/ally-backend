import { geoName } from './georgianCase';
import { nameToSay } from './spokenName';
import { DEFAULT_PUSH_TIME_ZONE } from './pushQuietHours';
import type { RunLanguage } from './runLanguage';

/**
 * #1684 (A1, D679/D680) — where one ask stands, per person asked.
 *
 * The goal used to count asks sent, and „no answer yet" read like „no". The
 * state is computed from the stamps on the task_asks row (migration 207)
 * rather than stored as a status, because six readers depend on `status`
 * staying sent / answered / cancelled (migration 180).
 */
export enum AskState {
  Held = 'held',
  Sent = 'sent',
  Seen = 'seen',
  Later = 'later',
  Answered = 'answered',
  Declined = 'declined',
  Expired = 'expired',
  Cancelled = 'cancelled',
}

/** Two weeks of silence end an ask, as for introduction requests (D496). */
export const ASK_EXPIRES_AFTER_DAYS = 14;

/** A typed or tapped „later" with no date holds for three days (Misho, 6 Oct, M). */
export const LATER_DEFAULT_DAYS = 3;

/** The stamps a state is read from — task_asks columns, or a held_asks row. */
export interface AskStamps {
  readonly status: string;
  readonly declined_at?: string | Date | null;
  readonly later_until?: string | Date | null;
  readonly expired_at?: string | Date | null;
  readonly seen_at?: string | Date | null;
  /** A held_asks row: no task_asks row exists yet. */
  readonly held_until?: string | Date | null;
}

const OPEN_STATES: ReadonlySet<AskState> = new Set([
  AskState.Held,
  AskState.Sent,
  AskState.Seen,
  AskState.Later,
]);

/** Still waiting on the person: never „nobody answered" while one of these stands. */
export function isOpenAskState(state: AskState): boolean {
  return OPEN_STATES.has(state);
}

function timeOf(value: string | Date | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const ms = new Date(value).getTime();
  return Number.isNaN(ms) ? null : ms;
}

export function askStateOf(ask: AskStamps, now: Date): AskState {
  if (ask.held_until !== undefined) return AskState.Held;
  if (ask.status === 'cancelled') return AskState.Cancelled;
  if (ask.status === 'answered') {
    return timeOf(ask.declined_at) === null ? AskState.Answered : AskState.Declined;
  }
  if (timeOf(ask.expired_at) !== null) return AskState.Expired;
  const laterUntil = timeOf(ask.later_until);
  if (laterUntil !== null && laterUntil > now.getTime()) return AskState.Later;
  return timeOf(ask.seen_at) === null ? AskState.Sent : AskState.Seen;
}

type LineMaker = (name: string, date: string) => string;

const OWNER_LINES: Readonly<Record<RunLanguage, Readonly<Record<AskState, LineMaker>>>> = {
  ka: {
    [AskState.Held]: (n, d) => `${n}: ${d} მიიღებს კითხვას`,
    [AskState.Sent]: (n) => `${n}: კითხვა მიუვიდა, პასუხს ველოდები`,
    [AskState.Seen]: (n) => `${n}: ნახა, პასუხს ველოდები`,
    [AskState.Later]: (n, d) => `${n}: ${d}`,
    [AskState.Answered]: (n) => `${n}: უპასუხა`,
    [AskState.Declined]: (n) => `${n}: მის სფეროში არ არის`,
    [AskState.Expired]: (n) => `${n}: ორი კვირა არ უპასუხია`,
    [AskState.Cancelled]: (n) => `${n}: კითხვა გაუქმდა`,
  },
  en: {
    [AskState.Held]: (n, d) => `${n}: will be asked on ${d}`,
    [AskState.Sent]: (n) => `${n}: asked, waiting for the answer`,
    [AskState.Seen]: (n) => `${n}: has seen it, waiting for the answer`,
    [AskState.Later]: (n, d) => `${n}: until ${d}`,
    [AskState.Answered]: (n) => `${n}: answered`,
    [AskState.Declined]: (n) => `${n}: not their field`,
    [AskState.Expired]: (n) => `${n}: no answer in two weeks`,
    [AskState.Cancelled]: (n) => `${n}: ask withdrawn`,
  },
  ru: {
    [AskState.Held]: (n, d) => `${n}: получит вопрос ${d}`,
    [AskState.Sent]: (n) => `${n}: вопрос отправлен, жду ответа`,
    [AskState.Seen]: (n) => `${n}: прочитал(а), жду ответа`,
    [AskState.Later]: (n, d) => `${n}: до ${d}`,
    [AskState.Answered]: (n) => `${n}: ответил(а)`,
    [AskState.Declined]: (n) => `${n}: не его/её сфера`,
    [AskState.Expired]: (n) => `${n}: нет ответа две недели`,
    [AskState.Cancelled]: (n) => `${n}: вопрос отозван`,
  },
  es: {
    [AskState.Held]: (n, d) => `${n}: recibirá la pregunta el ${d}`,
    [AskState.Sent]: (n) => `${n}: preguntado, esperando respuesta`,
    [AskState.Seen]: (n) => `${n}: lo ha visto, esperando respuesta`,
    [AskState.Later]: (n, d) => `${n}: hasta el ${d}`,
    [AskState.Answered]: (n) => `${n}: respondió`,
    [AskState.Declined]: (n) => `${n}: no es su campo`,
    [AskState.Expired]: (n) => `${n}: sin respuesta en dos semanas`,
    [AskState.Cancelled]: (n) => `${n}: pregunta retirada`,
  },
};

const DATE_LOCALES: Readonly<Record<RunLanguage, string>> = {
  ka: 'ka-GE',
  en: 'en-GB',
  ru: 'ru-RU',
  es: 'es-ES',
};

/**
 * The tester's 41946: „9 ოქტომბერი-მდე" is a suffix glued to a nominative.
 * Georgian declines the month itself — „9 ოქტომბრამდე" (until), „9 ოქტომბერს"
 * (on) — so the day is built from the parts, not from the locale's string.
 */
const KA_MONTH_UNTIL = [
  'იანვრამდე',
  'თებერვლამდე',
  'მარტამდე',
  'აპრილამდე',
  'მაისამდე',
  'ივნისამდე',
  'ივლისამდე',
  'აგვისტომდე',
  'სექტემბრამდე',
  'ოქტომბრამდე',
  'ნოემბრამდე',
  'დეკემბრამდე',
] as const;
const KA_MONTH_ON = [
  'იანვარს',
  'თებერვალს',
  'მარტს',
  'აპრილს',
  'მაისს',
  'ივნისს',
  'ივლისს',
  'აგვისტოს',
  'სექტემბერს',
  'ოქტომბერს',
  'ნოემბერს',
  'დეკემბერს',
] as const;
const KA_WEEKDAYS = [
  'კვირა',
  'ორშაბათი',
  'სამშაბათი',
  'ოთხშაბათი',
  'ხუთშაბათი',
  'პარასკევი',
  'შაბათი',
];

function tbilisiParts(ms: number): { day: number; month: number; weekday: number } {
  const local = new Date(
    new Date(ms).toLocaleString('en-US', { timeZone: DEFAULT_PUSH_TIME_ZONE }),
  );
  return { day: local.getDate(), month: local.getMonth(), weekday: local.getDay() };
}

/** „9 ოქტომბრამდე (პარასკევი)" for until, „8 ოქტომბერს (ხუთშაბათი)" for on. */
export function georgianDay(ms: number, sense: 'until' | 'on'): string {
  const { day, month, weekday } = tbilisiParts(ms);
  const monthWord = sense === 'until' ? KA_MONTH_UNTIL[month] : KA_MONTH_ON[month];
  return `${day} ${monthWord} (${KA_WEEKDAYS[weekday]})`;
}

function dayOf(
  value: string | Date | null | undefined,
  language: RunLanguage,
  sense: 'until' | 'on',
): string {
  const ms = timeOf(value);
  if (ms === null) return '';
  if (language === 'ka') return georgianDay(ms, sense);
  return new Date(ms).toLocaleDateString(DATE_LOCALES[language], {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: DEFAULT_PUSH_TIME_ZONE,
  });
}

/** One human line for the owner: „Zurab: until Thursday, 8 October". */
export function ownerAskLine(
  name: string,
  ask: AskStamps,
  state: AskState,
  language: RunLanguage,
): string {
  const date =
    state === AskState.Held
      ? dayOf(ask.held_until, language, 'on')
      : state === AskState.Later
        ? dayOf(ask.later_until, language, 'until')
        : '';
  return OWNER_LINES[language][state](nameToSay(name, language), date);
}

/**
 * D714 / D722 on the later path (the tester's 44551 and 44584, conv 41286 and
 * 42452): a one-person „later" told the asker in two lines, the sentence and
 * then a per-person status line under it. One sentence carries the day.
 */
const LATER_SENTENCES: Readonly<Record<RunLanguage, (name: string, day: string) => string>> = {
  ka: (n, d) => `${n} მოგვიანებით გიპასუხებს, ${d}.`,
  en: (n, d) => `${n} will answer later, by ${d}.`,
  ru: (n, d) => `${n} ответит позже, до ${d}.`,
  es: (n, d) => `${n} responderá más tarde, hasta el ${d}.`,
};

export function laterSentenceForAsker(
  name: string,
  until: string | Date,
  language: RunLanguage,
): string {
  return LATER_SENTENCES[language](nameToSay(name, language), dayOf(until, language, 'until'));
}

/**
 * 2872 (the tester's 45641, 6 of 6): when the server itself sent the owner's
 * question (case 1), the owner's whole reply was the bare status line
 * „<name>: კითხვა მიუვიდა, პასუხს ველოდები". D714 / D722: one person asked is
 * told in a plain sentence, not a status line.
 */
const SENT_SENTENCES: Readonly<Record<RunLanguage, (name: string) => string>> = {
  ka: (n) => `${geoName(n, 'dat')} კითხვა გავუგზავნე. როგორც კი გიპასუხებს, მაშინვე მოგწერ.`,
  en: (n) => `I sent your question to ${n}. I will tell you as soon as they answer.`,
  ru: (n) => `Я отправил вопрос: ${n}. Напишу, как только будет ответ.`,
  es: (n) => `Envié tu pregunta a ${n}. Te escribo en cuanto responda.`,
};

export function sentSentenceForOwner(name: string, language: RunLanguage): string {
  return (SENT_SENTENCES[language] ?? SENT_SENTENCES.ka)(name.trim());
}
