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
  readonly importContacts: string;
}

const WORDS: Readonly<Record<RunLanguage, GreetingWords>> = {
  ka: {
    hello: (name) => `გამარჯობა${name ? `, ${name}` : ''}! რით დაგეხმარო?`,
    importContacts: 'Netai ადამიანებს შენს კონტაქტებში პოულობს, ამიტომ კონტაქტები აპში შემოიტანე.',
  },
  en: {
    hello: (name) => `Hello${name ? `, ${name}` : ''}! How can I help?`,
    importContacts:
      'Netai finds people through your own contacts, so please import your contacts in the app.',
  },
  ru: {
    hello: (name) => `Привет${name ? `, ${name}` : ''}! Чем помочь?`,
    importContacts:
      'Netai находит людей через твои контакты, поэтому импортируй контакты в приложении.',
  },
  es: {
    hello: (name) => `¡Hola${name ? `, ${name}` : ''}! ¿En qué te ayudo?`,
    importContacts:
      'Netai encuentra personas a través de tus contactos, así que importa tus contactos en la app.',
  },
};

const SCRIPT_OF: Readonly<Record<RunLanguage, RegExp>> = {
  ka: /^[Ⴀ-ჿ]+$/u,
  en: /^[A-Za-z]+$/u,
  es: /^[A-Za-zÁÉÍÓÚÑÜáéíóúñü]+$/u,
  ru: /^[Ѐ-ӿ]+$/u,
};

/** The first name, only when it is written in the reply's own script. */
export function greetingName(registered: string | null, language: RunLanguage): string | null {
  const first = (registered ?? '').trim().split(/\s+/u)[0] ?? '';
  return first !== '' && SCRIPT_OF[language].test(first) ? first : null;
}

export function greetingText(
  name: string | null,
  hasContacts: boolean,
  language: RunLanguage,
): string {
  const words = WORDS[language] ?? WORDS.ka;
  return hasContacts ? words.hello(name) : `${words.hello(name)} ${words.importContacts}`;
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
