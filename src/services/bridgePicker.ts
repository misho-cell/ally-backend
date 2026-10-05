import { query } from '../db/postgres/client';
import { declineChoice, laterChoice } from './askOpening';
import { scrubText } from './privacyScrub';
import { RunLanguage } from './runLanguage';
import { OwnMatch, ownMatchesFor } from './tools/searchByTag';
import { georgianToLatin } from './tools/transliterate';

/**
 * PLATE v301 G4 — THE MEDIATOR WAS ASKED „WILL YOU HELP?" AND NOTHING ELSE.
 *
 * Giorgi was told the mediator knows a lawyer. The mediator was asked only
 * „do you know an experienced lawyer?" — not who he was picked for, not
 * which of his own contacts he would recommend. He had to search his own
 * phonebook in his head to answer a question our search had already answered.
 *
 * When the owner's assistant asks a member on behalf of a NEED, the server
 * now shows that member their OWN fitting contacts as buttons: the person the
 * owner's search found through them first, then a few more, then „someone
 * else". It is the reader's own phonebook, shown only to the reader; nothing
 * here reaches the asker unless the reader picks it and says so.
 */

/** How many contacts besides the one the bridge was picked for. */
const MAX_OTHER_FITTING_CONTACTS = 3;

/** A bridge search on a large phonebook is the slowest part of an ask; bounded. */
const PICKED_NAME_TIMEOUT_MS = 5_000;

/** What the asking side says the bridge is for. */
export interface BridgeNeed {
  /** The words the owner's search used — „იურისტი", „lawyer". */
  readonly need: string;
  /** The phone id the owner's search found through this bridge, if any. */
  readonly forPhone?: string;
}

/** The line added under the question, and the buttons that go with it. */
export interface BridgePicker {
  readonly line: string;
  readonly choices: readonly string[];
}

const OTHER_PERSON_CHOICE: Readonly<Record<RunLanguage, string>> = {
  en: 'Someone else',
  ru: 'Кого-то другого',
  es: 'Otra persona',
  ka: 'სხვას ვურჩევდი',
};

function pickerLine(language: RunLanguage, picked: string | null, others: string[]): string {
  const rest = others.join(', ');
  switch (language) {
    case 'en':
      return (
        (picked ? `You were asked because ${picked} is in your contacts.` : '') +
        (rest
          ? ` ${picked ? 'Others who may fit' : 'In your contacts, these may fit'}: ${rest}.`
          : '') +
        ' Whom would you recommend?'
      ).trim();
    case 'ru':
      return (
        (picked ? `Тебя спросили, потому что ${picked} есть в твоих контактах.` : '') +
        (rest
          ? ` ${picked ? 'Ещё могут подойти' : 'В твоих контактах могут подойти'}: ${rest}.`
          : '') +
        ' Кого бы ты порекомендовал?'
      ).trim();
    case 'es':
      return (
        (picked ? `Te preguntamos porque ${picked} está en tus contactos.` : '') +
        (rest
          ? ` ${picked ? 'También podrían encajar' : 'En tus contactos podrían encajar'}: ${rest}.`
          : '') +
        ' ¿A quién recomendarías?'
      ).trim();
    default:
      return (
        (picked ? `შენ იმიტომ გკითხეს, რომ შენს კონტაქტებშია ${picked}.` : '') +
        (rest
          ? ` ${picked ? 'შეიძლება ესენიც გამოდგნენ' : 'შენს კონტაქტებში შეიძლება გამოდგნენ'}: ${rest}.`
          : '') +
        ' ვის ურჩევდი?'
      ).trim();
  }
}

/** The bridge's own name for one phone: registered name, else their fullest label. */
export async function nameInBridgeBook(
  bridgeUserId: string,
  phone: string,
): Promise<string | null> {
  const result = await query<{ name: string | null }>(
    `SELECT COALESCE(CASE WHEN TRIM(u.name) LIKE '%@%' THEN NULL ELSE NULLIF(TRIM(u.name), '') END,
                     TRIM(ua.alias)) AS name
       FROM "UserAlias" ua
       LEFT JOIN "UserPhone" up ON up.phone = ua.phone
       LEFT JOIN "User" u ON u.id = up."userId"
      WHERE ua."contactId" = $1::int AND ua.phone = $2
        AND NULLIF(TRIM(ua.alias), '') IS NOT NULL
      ORDER BY LENGTH(TRIM(ua.alias)) DESC, ua.alias
      LIMIT 1`,
    [bridgeUserId, phone],
    PICKED_NAME_TIMEOUT_MS,
  );
  return result.rows[0]?.name?.trim() || null;
}

async function pickedName(
  bridgeUserId: string,
  forPhone: string | undefined,
  matches: readonly OwnMatch[],
): Promise<string | null> {
  if (!forPhone) return null;
  const inMatches = matches.find((m) => m.phone === forPhone);
  return inMatches ? inMatches.name : nameInBridgeBook(bridgeUserId, forPhone);
}

/**
 * #1453 (Tornike, Pr1, 5 Oct): Giorgi asked for an introduction to ONE named
 * person; Lika has her saved in Latin letters. The ask told Lika she was asked
 * because of a DIFFERENT person with the same surname, listed the wanted one
 * third, and asked „whom would you recommend". A picker is for a need („a
 * lawyer"); an ask about one named person is a yes or a no about that person.
 *
 * Names are compared across scripts and the common Latin spelling drift
 * („ts"/„c", „ch", „sh", „q"/„k"…), word for word.
 */
const SPELLING_DRIFT: readonly (readonly [RegExp, string])[] = [
  [/ts|tz/g, 'c'],
  [/ch|tch/g, 'c'],
  [/sh/g, 's'],
  [/zh/g, 'z'],
  [/kh/g, 'k'],
  [/gh/g, 'g'],
  [/q/g, 'k'],
  [/y/g, 'i'],
  [/w/g, 'v'],
];
const MIN_NAME_WORDS = 2;

function nameWords(name: string): string[] {
  const latin = georgianToLatin(name.toLowerCase()).replace(/[^a-z\s]/g, ' ');
  const drifted = SPELLING_DRIFT.reduce((text, [from, to]) => text.replace(from, to), latin);
  return drifted.split(/\s+/).filter((w) => w !== '');
}

/** Does this contact's name carry every word of the asked-for full name? */
export function isTheNamedPerson(need: string, contactName: string): boolean {
  const wanted = nameWords(need);
  if (wanted.length < MIN_NAME_WORDS) return false;
  const have = new Set(nameWords(contactName));
  return wanted.every((w) => have.has(w));
}

/** Names as the reader sees them, scrubbed (a label can hold a number), once each. */
function distinctNames(names: readonly string[]): string[] {
  return [...new Set(names.map((n) => scrubText(n).trim()).filter((n) => n !== ''))];
}

/**
 * The picker for one ask, or null when the reader has nobody fitting — then
 * the ask goes out exactly as before, with the ordinary three buttons.
 */
export async function bridgePicker(
  bridgeUserId: string,
  bridgeNeed: BridgeNeed,
  language: RunLanguage,
): Promise<BridgePicker | null> {
  const matches = await ownMatchesFor(
    bridgeUserId,
    bridgeNeed.need,
    MAX_OTHER_FITTING_CONTACTS + 1,
  );
  // #1453: the ask names one person the reader has saved — no pick-list.
  if (matches.some((m) => isTheNamedPerson(bridgeNeed.need, m.name))) return null;
  const picked = await pickedName(bridgeUserId, bridgeNeed.forPhone, matches);
  const pickedClean = picked ? (distinctNames([picked])[0] ?? null) : null;
  const others = distinctNames(
    matches.filter((m) => m.phone !== bridgeNeed.forPhone).map((m) => m.name),
  )
    .filter((name) => name !== pickedClean)
    .slice(0, MAX_OTHER_FITTING_CONTACTS);
  if (pickedClean === null && others.length === 0) return null;
  const names = pickedClean ? [pickedClean, ...others] : others;
  return {
    line: pickerLine(language, pickedClean, others),
    choices: [
      ...names,
      OTHER_PERSON_CHOICE[language] ?? OTHER_PERSON_CHOICE.ka,
      declineChoice(language),
      laterChoice(language),
    ],
  };
}
