import { georgianDay } from './askState';
import { DEFAULT_PUSH_TIME_ZONE } from './pushQuietHours';
import type { RunLanguage } from './runLanguage';

/**
 * #1686 (A3, D679/D680): a dated „later". The later button used to have no
 * date, and the ask never came back — „later" was where asks died. Now the tap
 * offers three one-tap days; whichever the reader picks (three days when they
 * pick none, or typed „later" in words), the ask comes back once at 09:30 on
 * that day, and the asker's goal shows „<name>: until <day>" meanwhile (A1).
 */
export const LATER_RETURN_HOUR = 9;
export const LATER_RETURN_MINUTE = 30;

interface DayChoice {
  readonly days: number;
  readonly labels: Readonly<Record<RunLanguage, string>>;
}

const DAY_CHOICES: readonly DayChoice[] = [
  { days: 1, labels: { ka: 'ხვალ', en: 'Tomorrow', ru: 'Завтра', es: 'Mañana' } },
  { days: 3, labels: { ka: '3 დღეში', en: 'In 3 days', ru: 'Через 3 дня', es: 'En 3 días' } },
  {
    days: 7,
    labels: {
      ka: 'მომავალ კვირას',
      en: 'Next week',
      ru: 'На следующей неделе',
      es: 'La próxima semana',
    },
  },
];

/** The three buttons under a „later", in the reader's language. */
export function laterDayChoices(language: RunLanguage): readonly string[] {
  return DAY_CHOICES.map((c) => c.labels[language] ?? c.labels.ka);
}

/** How many days a tap of one of those buttons means, in any language; null otherwise. */
export function laterDaysOf(message: string): number | null {
  const said = message.trim();
  return DAY_CHOICES.find((c) => Object.values(c.labels).includes(said))?.days ?? null;
}

/**
 * „Later" typed in words with no date: the spec's three days. Short messages
 * only, so a sentence that merely mentions later is never taken for a delay.
 */
const TYPED_LATER_MAX_CHARS = 40;
const TYPED_LATER_RE =
  /^(?:\s*(?:ok|კარგი|ok,)?\s*)(?:მოგვიანებით|მერე|ცოტა ხანში|later|not now|позже|потом|más tarde|luego)[\s.!,]*(?:გიპასუხებ|გეტყვი|i'?ll answer|отвечу|respondo)?[\s.!]*$/iu;

export function isTypedLater(message: string): boolean {
  const said = message.trim();
  return said.length > 0 && said.length <= TYPED_LATER_MAX_CHARS && TYPED_LATER_RE.test(said);
}

/** The SQL for „that many days from today, at 09:30 Tbilisi time", as an expression of $days. */
export const LATER_UNTIL_SQL = (daysParam: string): string =>
  `((((NOW() AT TIME ZONE '${DEFAULT_PUSH_TIME_ZONE}')::date + ${daysParam}::int)` +
  ` + TIME '${String(LATER_RETURN_HOUR).padStart(2, '0')}:${LATER_RETURN_MINUTE}')` +
  ` AT TIME ZONE '${DEFAULT_PUSH_TIME_ZONE}')`;

/** The reader's one line: when the question will come back. */
export function laterConfirmLine(language: RunLanguage, until: Date): string {
  const en = until.toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: DEFAULT_PUSH_TIME_ZONE,
  });
  switch (language) {
    case 'en':
      return `All right — I'll bring the question back on ${en}.`;
    case 'ru':
      return `Хорошо — напомню об этом вопросе ${until.toLocaleDateString('ru-RU', {
        day: 'numeric',
        month: 'long',
        timeZone: DEFAULT_PUSH_TIME_ZONE,
      })}.`;
    case 'es':
      return `De acuerdo — te lo recordaré el ${until.toLocaleDateString('es-ES', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        timeZone: DEFAULT_PUSH_TIME_ZONE,
      })}.`;
    default:
      return `კარგი — ამ კითხვას ${georgianDay(until.getTime(), 'on')} შეგახსენებ.`;
  }
}
