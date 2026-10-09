import { query } from '../db/postgres/client';
import { declineChoice, laterChoice } from './askOpening';
import { normalizePhone } from './phone';
import { scrubText } from './privacyScrub';
import { RunLanguage } from './runLanguage';
import { OwnMatch, ownMatchesFor } from './tools/searchByTag';
import { nameKey } from './tools/transliterate';

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

/**
 * 2907 (the tester's 46036): „ჰკითხე ნანას, იცნობს თუ არა კარგ სტომატოლოგს" —
 * an instructed ask carries no search behind it, so no need reached the picker
 * and the helper's saved dentist was not offered. The need is the trade the
 * question asks about: the word after „იცნობ… (თუ არა) (კარგ/სანდო…)", or after
 * "know a (good) …". A Georgian dative „-ს" is dropped.
 */
const KNOWS_A_TRADE_RE =
  /(?:იცნობ\p{L}*\s+(?:თუ\s+არა\s+)?(?:(?:კარგ|სანდო|გამოცდილ|ნორმალურ)\p{L}*\s+)?(\p{L}{4,}))|(?:\bknows?\s+(?:of\s+)?(?:a|an|any)?\s*(?:(?:good|reliable|trusted)\s+)?([a-z]{4,}))/iu;
const GEORGIAN_DATIVE_RE = /(?<=\p{L}{3})ს$/u;

export function needFromQuestion(question: string): BridgeNeed | undefined {
  const found = question.match(KNOWS_A_TRADE_RE);
  const word = found?.[1] ?? found?.[2];
  if (word === undefined) return undefined;
  return { need: word.replace(GEORGIAN_DATIVE_RE, '') };
}

/** The line added under the question, and the buttons that go with it. */
export interface BridgePicker {
  readonly line: string;
  readonly choices: readonly string[];
  /** The reader's own fitting people alone, picked first (2907). */
  readonly names: readonly string[];
  /** 2907 (46235): what the reader herself saved about each name (place of work, city). */
  readonly details: Readonly<Record<string, string>>;
}

const OTHER_PERSON_CHOICE: Readonly<Record<RunLanguage, string>> = {
  en: 'Someone else',
  ru: 'Кого-то другого',
  es: 'Otra persona',
  ka: 'სხვას ვურჩევდი',
};

/**
 * #2185 (the founder's screen, 7 Oct): the line ended „… ვის ურჩევდი?" under a
 * question that had already asked — two questions in one message. It says only
 * why the reader was asked and who may fit; the names are the buttons.
 */
function pickerLine(
  language: RunLanguage,
  pickedOne: string | null,
  others: string[],
  details: Readonly<Record<string, string>>,
): string {
  const rest = others.map((name) => withDetail(name, details)).join(', ');
  const picked = pickedOne === null ? null : withDetail(pickedOne, details);
  const offered = others.length + (pickedOne === null ? 0 : 1);
  const line = pickerSentences(language, picked, rest);
  // 2186: more than one may be recommended — said once, under the names.
  return offered >= 2 ? `${line} ${MORE_THAN_ONE_HINT[language] ?? MORE_THAN_ONE_HINT.ka}` : line;
}

const MORE_THAN_ONE_HINT: Readonly<Record<RunLanguage, string>> = {
  ka: 'თუ რამდენიმეს ურჩევდი, დაწერე „ორივე" ან მათი სახელები.',
  en: 'If more than one fits, write „both" or their names.',
  ru: 'Если подходят несколько, напиши «оба» или их имена.',
  es: 'Si encajan varios, escribe «ambos» o sus nombres.',
};

function pickerSentences(language: RunLanguage, picked: string | null, rest: string): string {
  switch (language) {
    case 'en':
      return (
        (picked ? `You were asked because ${picked} is in your contacts.` : '') +
        (rest
          ? ` ${picked ? 'Others who may fit' : 'In your contacts, these may fit'}: ${rest}.`
          : '')
      ).trim();
    case 'ru':
      return (
        (picked ? `Тебя спросили, потому что ${picked} есть в твоих контактах.` : '') +
        (rest
          ? ` ${picked ? 'Ещё могут подойти' : 'В твоих контактах могут подойти'}: ${rest}.`
          : '')
      ).trim();
    case 'es':
      return (
        (picked ? `Te preguntamos porque ${picked} está en tus contactos.` : '') +
        (rest
          ? ` ${picked ? 'También podrían encajar' : 'En tus contactos podrían encajar'}: ${rest}.`
          : '')
      ).trim();
    default:
      return (
        (picked ? `შენ იმიტომ გკითხეს, რომ შენს კონტაქტებშია ${picked}.` : '') +
        (rest
          ? ` ${picked ? 'შეიძლება ესენიც გამოდგნენ' : 'შენს კონტაქტებში შეიძლება გამოდგნენ'}: ${rest}.`
          : '')
      ).trim();
  }
}

/** A name as the line shows it: with what the reader saved about them, when anything. */
function withDetail(name: string, details: Readonly<Record<string, string>>): string {
  const detail = details[name];
  return detail ? `${name} (${detail})` : name;
}

/**
 * 2907 (the tester's 46235, 0 of 2): the helper tapped her saved dentist and
 * the owner read only „ნინო, a dentist" — not the clinic or the district she
 * had saved. Her assistant may pass only what she said (D648), and a tap on a
 * name says the name. So what she saved about that person is shown to her in
 * the line, before the tap; tapping the name approves the name with it.
 * Only the place of work and the city, only her own saved values, never a note.
 */
const DETAIL_FIELDS: readonly string[] = ['employer', 'city'];
const MAX_DETAIL_CHARS = 80;

async function savedDetails(
  bridgeUserId: string,
  people: ReadonlyArray<{ readonly name: string; readonly phone: string }>,
): Promise<Record<string, string>> {
  if (people.length === 0) return {};
  try {
    return detailsByName(people, await readSavedDetails(bridgeUserId, people));
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[bridge-picker] saved details not read:', (err as Error).message);
    return {};
  }
}

interface SavedDetailRow {
  readonly phone: string;
  readonly field_type: string;
  readonly value: string;
}

async function readSavedDetails(
  bridgeUserId: string,
  people: ReadonlyArray<{ readonly name: string; readonly phone: string }>,
): Promise<readonly SavedDetailRow[]> {
  const phones = people.map((p) => normalizePhone(p.phone));
  const result = await query<SavedDetailRow>(
    `SELECT DISTINCT ON (neo4j_contact_id, field_type)
            neo4j_contact_id AS phone, field_type, COALESCE(canonical_value, value) AS value
       FROM contact_facts
      WHERE submitted_by_user_id = $1 AND neo4j_contact_id = ANY($2::text[])
        AND field_type = ANY($3::text[]) AND retracted_at IS NULL
      ORDER BY neo4j_contact_id, field_type, updated_at DESC
      LIMIT $4`,
    [bridgeUserId, phones, DETAIL_FIELDS, phones.length * DETAIL_FIELDS.length],
    PICKED_NAME_TIMEOUT_MS,
  );
  return result.rows;
}

function detailsByName(
  people: ReadonlyArray<{ readonly name: string; readonly phone: string }>,
  rows: readonly SavedDetailRow[],
): Record<string, string> {
  const details: Record<string, string> = {};
  for (const person of people) {
    const phone = normalizePhone(person.phone);
    const parts = DETAIL_FIELDS.map(
      (field) => rows.find((r) => r.phone === phone && r.field_type === field)?.value,
    )
      .map((value) => (value === undefined ? '' : scrubText(value).trim()))
      .filter((value) => value !== '');
    const detail = parts.join(', ').slice(0, MAX_DETAIL_CHARS).trim();
    if (detail !== '') details[person.name] = detail;
  }
  return details;
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
const MIN_NAME_WORDS = 2;

function nameWords(name: string): string[] {
  return nameKey(name)
    .split(' ')
    .filter((w) => w !== '');
}

/** Does this contact's name carry every word of the asked-for full name? */
export function isTheNamedPerson(need: string, contactName: string): boolean {
  const wanted = nameWords(need);
  if (wanted.length < MIN_NAME_WORDS) return false;
  const have = new Set(nameWords(contactName));
  return wanted.every((w) => have.has(w));
}

/** Each shown name with the phone it stands for, so what was saved about it can be read. */
function phonesOf(
  names: readonly string[],
  matches: readonly OwnMatch[],
  forPhone: string | undefined,
  picked: string | null,
): Array<{ name: string; phone: string }> {
  return names.flatMap((name) => {
    const phone =
      name === picked && forPhone
        ? forPhone
        : matches.find((m) => distinctNames([m.name])[0] === name)?.phone;
    return phone === undefined ? [] : [{ name, phone }];
  });
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
  const details = await savedDetails(
    bridgeUserId,
    phonesOf(names, matches, bridgeNeed.forPhone, pickedClean),
  );
  return {
    line: pickerLine(language, pickedClean, others, details),
    names,
    details,
    choices: [
      ...names,
      OTHER_PERSON_CHOICE[language] ?? OTHER_PERSON_CHOICE.ka,
      declineChoice(language),
      laterChoice(language),
    ],
  };
}
