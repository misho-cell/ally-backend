import { query } from '../db/postgres/client';
import { RunLanguage } from './runLanguage';

/**
 * The tester's 1114 (seat 16, the founder's D617): „a hello gets a hello at
 * once". The greeting turn already ran with no tools, yet it took 8–10 seconds
 * and $0.03–0.05: the whole prompt went to one model to write „გამარჯობა,
 * თორნიკე" and to a second to rewrite it. A bare greeting outside a goal is now
 * answered by the server itself, in the owner's language, with the import line
 * when the phonebook is empty (H3).
 */
const NAME_TIMEOUT_MS = 3_000;

interface GreetingWords {
  readonly hello: (name: string | null) => string;
  readonly fine: string;
  readonly importContacts: string;
}

const WORDS: Readonly<Record<RunLanguage, GreetingWords>> = {
  ka: {
    hello: (name) => `გამარჯობა${name ? `, ${name}` : ''}! რით დაგეხმარო?`,
    fine: 'კარგად ვარ, მადლობა.',
    importContacts: 'Netai ადამიანებს შენს კონტაქტებში პოულობს, ამიტომ კონტაქტები აპში შემოიტანე.',
  },
  en: {
    hello: (name) => `Hello${name ? `, ${name}` : ''}! How can I help?`,
    fine: 'I am well, thank you.',
    importContacts:
      'Netai finds people through your own contacts, so please import your contacts in the app.',
  },
  ru: {
    hello: (name) => `Привет${name ? `, ${name}` : ''}! Чем помочь?`,
    fine: 'Всё хорошо, спасибо.',
    importContacts:
      'Netai находит людей через твои контакты, поэтому импортируй контакты в приложении.',
  },
  es: {
    hello: (name) => `¡Hola${name ? `, ${name}` : ''}! ¿En qué te ayudo?`,
    fine: 'Muy bien, gracias.',
    importContacts:
      'Netai encuentra personas a través de tus contactos, así que importa tus contactos en la app.',
  },
};

/** Letters only: a name of digits, an e-mail or an emoji is not greeted by. */
const NAME_RE = /^[\p{L}'-]+$/u;

/**
 * The first name as saved. The tester's 1117: the founder's name is saved in
 * Latin letters, and dropping it for a Georgian reply lost „hello, Tornike".
 */
export function greetingName(registered: string | null): string | null {
  const first = (registered ?? '').trim().split(/\s+/u)[0] ?? '';
  return first !== '' && NAME_RE.test(first) ? first : null;
}

const ASKS_HOW_I_AM_RE =
  /(როგორ\s+ხარ|rogor\s+(?:khar|xar|har)|how\s+are\s+you|как\s+дела|qué\s+tal)/iu;
const AFTER_EXCLAMATION_RE = /!\s*/u;
/** The hello word each language's line opens with; the Spanish line keeps its opening mark. */
const HELLO_WORD_RE = /^(¡?)(?:გამარჯობა|Hello|Привет|Hola)/u;

/**
 * 2114 (box 54162, Lika's point): „დილა მშვიდობისა" and „საღამო მშვიდობისა"
 * were answered „გამარჯობა". With the switch on, a time-of-day greeting is
 * answered with the person's own words — nothing the server did not hear.
 *
 * USER-VISIBLE: ON since Misho's yes, 12 Oct 11:39 UTC („1 კი", §132). Back to
 * false answers every hello „გამარჯობა" again.
 */
export const MIRRORED_GREETING_ON = true;

/**
 * #7789 (3) (Misho, 27 Oct: the tester's DONE WHEN decides — „a hello gets
 * only the model's short hello"): the import line no longer follows a hello on
 * an empty phonebook. Back to true adds it again.
 */
export const IMPORT_LINE_AFTER_HELLO_ON = false;

const GEORGIAN_LETTER_RE = /\p{Script=Georgian}/u;

const GEORGIAN_TIME_OF_DAY_RE = /^(დილა|საღამო)\s*მშვიდობისა?/u;

const TIME_OF_DAY_GREETING_RE =
  /^\s*((?:დილა|საღამო)\s*მშვიდობისა?|good\s+(?:morning|afternoon|evening)|доброе\s+утро|добрый\s+(?:день|вечер)|buen(?:os|as)\s+(?:días|tardes|noches))/iu;

/** The person's own time-of-day greeting, as typed, or null for any other hello. */
export function timeOfDayGreeting(greeting: string): string | null {
  const said = TIME_OF_DAY_GREETING_RE.exec(greeting)?.[1];
  if (said === undefined) return null;
  const first = said.charAt(0);
  // Georgian has no capitals in running text; upper-casing it gives Mtavruli.
  const opening = GEORGIAN_LETTER_RE.test(first) ? first : first.toLocaleUpperCase();
  // The tester's 56030: „დილამშვიდობის" was not recognized, and the model copied the typo. The
  // same words come back spelled right.
  return (opening + said.slice(1))
    .replace(GEORGIAN_TIME_OF_DAY_RE, '$1 მშვიდობისა')
    .replace(/\s+/gu, ' ');
}

function openingHello(
  words: GreetingWords,
  name: string | null,
  greeting: string,
  mirror: boolean,
): string {
  const own = mirror ? timeOfDayGreeting(greeting) : null;
  if (own === null) return words.hello(name);
  return words.hello(name).replace(HELLO_WORD_RE, (_match, mark: string) => `${mark}${own}`);
}

export function greetingText(
  name: string | null,
  hasContacts: boolean,
  language: RunLanguage,
  greeting = '',
  mirror: boolean = MIRRORED_GREETING_ON,
): string {
  const words = WORDS[language] ?? WORDS.ka;
  const opening = openingHello(words, name, greeting, mirror);
  // The tester's 1117: „გამარჯობა, როგორ ხარ?" got only the hello.
  const hello = ASKS_HOW_I_AM_RE.test(greeting)
    ? opening.replace(AFTER_EXCLAMATION_RE, `! ${words.fine} `)
    : opening;
  return hasContacts || !IMPORT_LINE_AFTER_HELLO_ON ? hello : `${hello} ${words.importContacts}`;
}

/** The registered name; null when it cannot be read, so the greeting goes without it. */
export async function registeredName(userId: string): Promise<string | null> {
  try {
    const result = await query<{ name: string | null }>(
      'SELECT name FROM "User" WHERE id = $1 LIMIT 1',
      [userId],
      NAME_TIMEOUT_MS,
    );
    return result.rows[0]?.name ?? null;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(`[greeting] could not read the name of ${userId}:`, (err as Error).message);
    return null;
  }
}
