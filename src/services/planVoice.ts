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

/**
 * 48086 (conv 46897): „…ოთხივე ნაცნობს … ჰკითხავ, ხომ არ იცნობენ…" — the plan
 * told the OWNER he would ask, when the asking is Netai's. In a plan reply,
 * Netai's own actions in the „you" form are its own: ჰკითხავ → ვკითხავ. Not
 * when the sentence says the owner does it himself („შენ", „თვითონ" before the
 * verb) — then „you" is right.
 */
const NETAIS_OWN_ACTS_KA: Readonly<Record<string, string>> = {
  ჰკითხავ: 'ვკითხავ',
  მისწერ: 'მივწერ',
  გაუგზავნი: 'გავუგზავნი',
  დაუკავშირდები: 'დავუკავშირდები',
  დაელაპარაკები: 'დაველაპარაკები',
};
const NETAIS_OWN_ACT_RE = new RegExp(
  `(?<![\\p{L}\\p{M}])(${Object.keys(NETAIS_OWN_ACTS_KA).join('|')})(?![\\p{L}\\p{M}])`,
  'gu',
);
const OWNER_DOES_IT_RE = /(?<![\p{L}\p{M}])(?:შენ|თვითონ|თავად)(?![\p{L}\p{M}])/u;
/** Split after every sentence end, keeping every character. */
const AFTER_SENTENCE_END_RE = /(?<=[.!?\n])/u;

function netaiDoesTheAsking(text: string): string {
  return text
    .split(AFTER_SENTENCE_END_RE)
    .map((sentence) =>
      sentence.replace(NETAIS_OWN_ACT_RE, (verb, _w: string, offset: number) =>
        OWNER_DOES_IT_RE.test(sentence.slice(0, offset))
          ? verb
          : (NETAIS_OWN_ACTS_KA[verb] ?? verb),
      ),
    )
    .join('');
}

function inSecondPerson(text: string): string {
  return netaiDoesTheAsking(
    VOICE_FIXES.reduce((out, fix) => out.replace(fix.pattern, fix.second), text),
  );
}

/** The plan reply with Netai's „my contacts / my network" said as the owner's, and its own acts as its own. */
export function withOwnersNetwork(reply: string): string {
  return reply
    .split(QUOTED_RE)
    .map((part, i) => (i % 2 === 1 ? part : inSecondPerson(part)))
    .join('');
}
