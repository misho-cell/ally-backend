import { query } from '../db/postgres/client';
import { RunLanguage } from './runLanguage';
import { foldedLower } from './tools/georgianCase';

/**
 * 3203 (Lika's phone, 8 Oct 12:09 Tbilisi): „ჩემი კონტაქტებიდან <name> იცნობს
 * თუ არა ვინმე კარგ ხელოსანს?" — about ONE saved contact who is not on Netai.
 * The run asked for the city, then the kind of handyman, then promised to ask
 * a person Netai cannot reach, and never said she is not on Netai. (With
 * „ჰკითხე" the instructed-ask path already answers it; without, nothing did.)
 *
 * The server answers it at once, before any model call: the person is not on
 * Netai, and the two ways left are buttons. Only when the line names exactly
 * one saved contact by their whole saved name, and that number has no account.
 * Anything else goes on to the run as before.
 */
const QUERY_TIMEOUT_MS = 4_000;
const MIN_NAME_WORDS = 2;
const MAX_NAME_WORDS = 3;

/** „(ჩემი კონტაქტებიდან) <Name Surname> (თუ) იცნობს …" — the name before the verb. */
const KNOWS_RE =
  /^\s*(?:ჩემი\s+კონტაქტებიდან\s+|ჩემს\s+კონტაქტებში\s+)?((?:\p{L}[\p{L}'-]*\s+){1,2}?\p{L}[\p{L}'-]*)\s+(?:თუ\s+)?იცნობს(?=[\s?,.!]|$)/iu;

/** The saved name the line asks about, or null when it does not ask about one person. */
export function namedKnower(message: string): string | null {
  const name = message.match(KNOWS_RE)?.[1]?.trim();
  if (name === undefined) return null;
  const words = name.split(/\s+/u).length;
  return words >= MIN_NAME_WORDS && words <= MAX_NAME_WORDS ? name : null;
}

/** The contact's name as saved, when it is one saved number with no Netai account; else null. */
export async function savedNonMember(userId: string, name: string): Promise<string | null> {
  try {
    const result = await query<{ alias: string; phones: number; members: number }>(
      `SELECT MIN(TRIM(ua.alias)) AS alias,
              COUNT(DISTINCT ua.phone)::int AS phones,
              COUNT(DISTINCT up.phone)::int AS members
         FROM "UserAlias" ua
         LEFT JOIN "UserPhone" up ON up.phone = ua.phone
        WHERE ua."contactId" = $1::int
          AND ${foldedLower('TRIM(ua.alias)')} = ${foldedLower('$2::text')}
        LIMIT 1`,
      [userId, name.trim()],
      QUERY_TIMEOUT_MS,
    );
    const row = result.rows[0];
    return row !== undefined && row.phones === 1 && row.members === 0 ? row.alias : null;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[non-member] contact not read:', (err as Error).message);
    return null;
  }
}

export interface NonMemberAnswer {
  readonly text: string;
  readonly choices: readonly string[];
}

const ANSWER: Readonly<Record<RunLanguage, (name: string) => NonMemberAnswer>> = {
  ka: (name) => ({
    text: `${name} Netai-ზე არ არის, ამიტომ Netai-ით მას ვერ ვკითხავ. შეგიძლია მოიწვიო, ან სხვებს ვკითხოთ.`,
    choices: ['მოვიწვიოთ', 'სხვებს ვკითხოთ'],
  }),
  en: (name) => ({
    text: `${name} is not on Netai, so I cannot ask them through Netai. You can invite them, or we can ask others.`,
    choices: ['Invite them', 'Ask others'],
  }),
  ru: (name) => ({
    text: `${name} нет в Netai, поэтому через Netai я не могу его спросить. Можно пригласить или спросить других.`,
    choices: ['Пригласить', 'Спросить других'],
  }),
  es: (name) => ({
    text: `${name} no está en Netai, así que no puedo preguntarle por Netai. Puedes invitarle o preguntamos a otros.`,
    choices: ['Invitar', 'Preguntar a otros'],
  }),
};

export function nonMemberAnswer(name: string, language: RunLanguage): NonMemberAnswer {
  return (ANSWER[language] ?? ANSWER.ka)(name);
}
