import { RunLanguage } from './runLanguage';
import { budgetWindow } from './budgetWindow';

/**
 * THE DAY THE ALLOWANCE COMES BACK, in words, in the reader's language.
 *
 * D494, the founder: „tell the user to top up OR wait for the refill, WITH THE
 * DAY." The refusal used to say „wait for the monthly renewal" — true, and it
 * leaves somebody unable to tell whether that is ten minutes or three weeks.
 * Waiting is one of the two things being offered, and a choice between paying
 * and waiting an unknown time is not a choice.
 *
 * ⚠️ THE NAMES ARE WRITTEN OUT HERE AND NOT TAKEN FROM `Intl`, and tonight is
 * why. `Intl.DateTimeFormat('ka-GE')` returns Georgian month names on this
 * machine and English ones on a Node built with small-icu — silently, with no
 * error, because a missing locale FALLS BACK rather than throwing. The same
 * shape as the `File` global that failed on the first real speech call a few
 * hours ago: correct here, absent there, and nothing in a test can see the
 * difference. Four languages times twelve months is a small table and it says
 * the same thing on every runtime there is.
 */
const MONTHS: Record<RunLanguage, readonly string[]> = {
  ka: [
    'იანვარი',
    'თებერვალი',
    'მარტი',
    'აპრილი',
    'მაისი',
    'ივნისი',
    'ივლისი',
    'აგვისტო',
    'სექტემბერი',
    'ოქტომბერი',
    'ნოემბერი',
    'დეკემბერი',
  ],
  en: [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
  ],
  ru: [
    'января',
    'февраля',
    'марта',
    'апреля',
    'мая',
    'июня',
    'июля',
    'августа',
    'сентября',
    'октября',
    'ноября',
    'декабря',
  ],
  es: [
    'enero',
    'febrero',
    'marzo',
    'abril',
    'mayo',
    'junio',
    'julio',
    'agosto',
    'septiembre',
    'octubre',
    'noviembre',
    'diciembre',
  ],
};

/**
 * Sunday first, as `Date.getUTCDay()` counts. Carried because „Monday the
 * 28th" is a thing somebody can plan around and „the 28th" is a thing they
 * have to go and look up.
 */
const WEEKDAYS: Record<RunLanguage, readonly string[]> = {
  ka: ['კვირა', 'ორშაბათი', 'სამშაბათი', 'ოთხშაბათი', 'ხუთშაბათი', 'პარასკევი', 'შაბათი'],
  en: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
  ru: ['воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота'],
  es: ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'],
};

/**
 * „on Monday" and „on 28 September" in Georgian are the dative, which for
 * these words is the nominative with its final ი replaced by ს:
 * ორშაბათი -> ორშაბათს, სექტემბერი -> სექტემბერს. The rule is written here
 * rather than a second table of twelve, and it is only ever applied to the
 * nineteen words above.
 */
function geoOn(word: string): string {
  return (word.endsWith('ი') ? word.slice(0, -1) : word) + 'ს';
}

/** „ორშაბათს, 28 სექტემბერს" · „Monday 28 September" · „в понедельник, 28 сентября". */
export function renewalDay(language: RunLanguage, when: Date): string {
  const day = when.getUTCDate();
  const month = MONTHS[language][when.getUTCMonth()];
  const weekday = WEEKDAYS[language][when.getUTCDay()];
  switch (language) {
    case 'ka':
      return `${geoOn(weekday)}, ${day} ${geoOn(month)}`;
    case 'ru':
      return `в ${weekday}, ${day} ${month}`;
    case 'es':
      return `el ${weekday} ${day} de ${month}`;
    default:
      return `${weekday} ${day} ${month}`;
  }
}

/** The next refill, from the window in force — monthly today, weekly on D124's switch. */
export function nextRenewalDay(language: RunLanguage, now: Date = new Date()): string {
  return renewalDay(language, budgetWindow().nextReset(now));
}
