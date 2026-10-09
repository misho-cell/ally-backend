/**
 * P3 (the tester's 47972, conv 46812): the plan reply said „ჩემს ნაცნობებში
 * პირდაპირ ფოტოგრაფი არ აღმოჩნდა … ლევან მოგონილაძე (ის ჩემი ქსელის წევრია)"
 * — Netai speaking as the owner. Netai has no contacts and no network of its
 * own: every contact, circle and network it reports on is the owner's. In the
 * plan reply, „my" before one of those nouns is always the owner's and reads
 * as „your". Text inside quotes is someone's own words and is left alone.
 */

interface VoiceFix {
  readonly pattern: RegExp;
  readonly second: (first: string) => string;
}

const NETWORK_NOUN_KA = '(?=\\s+(?:ნაცნობ|კონტაქტ|ქსელ|წრე))';

const FIRST_TO_SECOND_KA: Readonly<Record<string, string>> = {
  ჩემს: 'შენს',
  ჩემი: 'შენი',
  ჩემმა: 'შენმა',
  ჩემ: 'შენ',
};

const FIRST_TO_SECOND_ES: Readonly<Record<string, string>> = {
  mis: 'tus',
  Mis: 'Tus',
  mi: 'tu',
  Mi: 'Tu',
};

const VOICE_FIXES: readonly VoiceFix[] = [
  {
    pattern: new RegExp(`(?<![\\p{L}\\p{M}])(ჩემს|ჩემი|ჩემმა|ჩემ)${NETWORK_NOUN_KA}`, 'gu'),
    second: (first) => FIRST_TO_SECOND_KA[first] ?? first,
  },
  {
    pattern: /\b(my|My)(?=\s+(?:contacts?|network|circle|connections?)\b)/gu,
    second: (first) => (first === 'My' ? 'Your' : 'your'),
  },
  {
    pattern: /(?<![\p{L}\p{M}])(mis|Mis|mi|Mi)(?=\s+(?:contactos?|red|círculo)\b)/gu,
    second: (first) => FIRST_TO_SECOND_ES[first] ?? first,
  },
  {
    pattern:
      /(?<![\p{L}\p{M}])(мои|моих|моей|моём|моем|моя|мой|моим)(?=\s+(?:контакт|сет|круг|знаком))/giu,
    second: (first) => first.replace(/^м/u, 'тв').replace(/^М/u, 'Тв'),
  },
];

/** Quoted spans („…", "…", «…») — someone's own words. */
const QUOTED_RE = /(„[^"“”]*["“”]|"[^"]*"|«[^»]*»)/u;

function inSecondPerson(text: string): string {
  return VOICE_FIXES.reduce((out, fix) => out.replace(fix.pattern, fix.second), text);
}

/** The plan reply with Netai's „my contacts / my network" said as the owner's. */
export function withOwnersNetwork(reply: string): string {
  return reply
    .split(QUOTED_RE)
    .map((part, i) => (i % 2 === 1 ? part : inSecondPerson(part)))
    .join('');
}
