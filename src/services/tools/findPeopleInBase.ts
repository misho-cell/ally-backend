import { query } from '../../db/postgres/client';
import { phoneDigits } from '../phone';
import { ContactExclusion, fetchExclusionsForPhones } from './contactExclusions';
import { countryInNeed, needWords } from './findCompaniesForNeed';
import { foldedLower } from './georgianCase';

/**
 * 6997 — „I need someone in transport in Kazakhstan": the person store holds
 * the people the research base knows, numbered or not, with their confirmed
 * facts and the ties the package states. A person with no number is reached
 * through someone who knows them: each hit comes with the people tied to it
 * who do have a number, the owner himself and his own contacts first.
 */

const BASE_QUERY_TIMEOUT_MS = 8_000;
const MAX_PEOPLE = 8;
const MAX_FACTS_PER_PERSON = 5;
const MAX_BRIDGES_PER_PERSON = 4;
const MAX_FACT_ROWS = 200;
const COUNTRY_KEY = 'country';
const MAX_PLACE_CHARS = 40;
const MAX_PLACES = 300;
/** Enough per person that the owner and his own contacts are among them before ranking. */
const MAX_TIES_PER_PERSON = 100;
const MAX_TIE_ROWS = MAX_PEOPLE * MAX_TIES_PER_PERSON;
/**
 * Tester 78510 (#6997, founder connector): a real person's known_by listed
 * „Test Referral", „Al Test", „Ag Pay Test" — the team's own test accounts,
 * which hold real numbers. A test account is nobody's route: a fictional seat,
 * or an account whose name carries the word „test".
 */
const TEST_ACCOUNT_NAME_RE = '\\mtest\\M';

interface PersonHit {
  readonly person_key: string;
  readonly name: string;
  readonly phone: string | null;
  readonly hits: number;
}

interface FactRow {
  readonly person_key: string;
  readonly key: string;
  readonly value: string;
}

interface TieRow {
  readonly person_key: string;
  readonly name: string;
  readonly phone: string;
  readonly tie: string;
}

/** How the owner stands to a number: it is his own, he saved it (and as what), or neither. */
interface OwnerView {
  readonly own: ReadonlySet<string>;
  readonly savedAs: ReadonlyMap<string, string>;
}

export interface BaseBridge {
  readonly name: string;
  readonly tie: string;
  readonly phone: string;
  readonly is_you?: true;
  readonly you_saved_as?: string;
  readonly excluded?: readonly ContactExclusion[];
}

export interface BasePerson {
  readonly name: string;
  readonly has_number: boolean;
  readonly phone?: string;
  readonly you_saved_as?: string;
  readonly facts: readonly { readonly key: string; readonly value: string }[];
  readonly known_by: readonly BaseBridge[];
}

export interface FindPeopleInBaseResult {
  readonly words: readonly string[];
  readonly place: string;
  readonly people: readonly BasePerson[];
  readonly note: string;
}

/** MODEL-FACING (D44): ships OFF; the prompt chat owns when the model reaches for it. */
const NOTE =
  'People from the research base, including people with no number. Their facts are confirmed ' +
  'and may be said. known_by lists who can reach each one and how (tie): to reach a person with ' +
  'no number, ask the one who knows them (find_warm_path with that one’s phone, or ask_contact ' +
  'when the user has them). Never say how anyone saved anyone.';

/** The countries the base's people are in, lower case: a need word naming one is the place. */
async function readPlaces(): Promise<string[]> {
  const result = await query<{ place: string }>(
    `SELECT DISTINCT ${foldedLower('value')} AS place FROM base_person_facts
      WHERE key = $1 AND length(value) <= $2
      LIMIT $3`,
    [COUNTRY_KEY, MAX_PLACE_CHARS, MAX_PLACES],
    BASE_QUERY_TIMEOUT_MS,
  );
  return result.rows.map((r) => r.place);
}

/** The words split into the place (if the need names one the base holds) and the trade. */
export function placeAndTrade(
  words: readonly string[],
  places: readonly string[],
): { place: string; trade: string[] } {
  const place = countryInNeed(words, places);
  if (place === '') return { place, trade: [...words] };
  const trade = words.filter((w) => !(place.startsWith(w) || w.startsWith(place)));
  return { place, trade: trade.length > 0 ? trade : [place] };
}

/** People in the place (when named), most trade words first, numbered ones first on a tie. */
async function readHits(trade: readonly string[], place: string): Promise<PersonHit[]> {
  const result = await query<PersonHit>(
    `SELECT * FROM (
       SELECT p.person_key, p.name, p.phone,
              (SELECT count(*) FROM unnest($1::text[]) w
                WHERE p.search_text LIKE '%' || w || '%')::int AS hits
         FROM base_people p
        WHERE $2 = '' OR p.search_text LIKE '%' || $2 || '%') s
      WHERE hits > 0
      ORDER BY hits DESC, (phone IS NULL), name
      LIMIT $3`,
    [[...trade], place, MAX_PEOPLE],
    BASE_QUERY_TIMEOUT_MS,
  );
  return result.rows;
}

async function readFacts(keys: readonly string[]): Promise<FactRow[]> {
  const result = await query<FactRow>(
    `SELECT person_key, key, value FROM base_person_facts
      WHERE person_key = ANY($1::text[])
      ORDER BY person_key, key
      LIMIT $2`,
    [[...keys], MAX_FACT_ROWS],
    BASE_QUERY_TIMEOUT_MS,
  );
  return result.rows;
}

/** The people tied to each hit, either way round, who have a number. */
async function readBridges(keys: readonly string[]): Promise<TieRow[]> {
  const result = await query<TieRow>(
    `SELECT person_key, name, phone, tie FROM (
       SELECT t.person_key, o.name, o.phone, t.tie,
              row_number() OVER (PARTITION BY t.person_key ORDER BY o.name) AS n
         FROM (SELECT from_key AS person_key, to_key AS other_key, tie FROM base_person_ties
                WHERE from_key = ANY($1::text[])
               UNION
               SELECT to_key, from_key, tie FROM base_person_ties
                WHERE to_key = ANY($1::text[])) t
         JOIN base_people o ON o.person_key = t.other_key AND o.phone IS NOT NULL
        WHERE o.name !~* $4
          AND NOT EXISTS (SELECT 1 FROM test_seats s WHERE 'U-' || s.user_id = o.person_key)) ranked
      WHERE n <= $2
      ORDER BY person_key, name
      LIMIT $3`,
    [[...keys], MAX_TIES_PER_PERSON, MAX_TIE_ROWS, TEST_ACCOUNT_NAME_RE],
    BASE_QUERY_TIMEOUT_MS,
  );
  return result.rows;
}

/** The owner's own numbers and the labels he saved on these numbers, by digits. */
async function readOwnerView(userId: string, phones: readonly string[]): Promise<OwnerView> {
  const digits = [...new Set(phones.map(phoneDigits))].filter((d) => d !== '');
  if (digits.length === 0) return { own: new Set(), savedAs: new Map() };
  const result = await query<{ digits: string; label: string | null; is_own: boolean }>(
    `SELECT regexp_replace(up.phone, '\\D', '', 'g') AS digits, NULL AS label, true AS is_own
       FROM "UserPhone" up WHERE up."userId" = $1::int
     UNION ALL
     SELECT regexp_replace(ua.phone, '\\D', '', 'g'), TRIM(ua.alias), false
       FROM "UserAlias" ua
      WHERE ua."contactId" = $1::int AND regexp_replace(ua.phone, '\\D', '', 'g') = ANY($2::text[])
      LIMIT $3`,
    [userId, digits, MAX_TIE_ROWS],
    BASE_QUERY_TIMEOUT_MS,
  );
  const own = new Set(result.rows.filter((r) => r.is_own).map((r) => r.digits));
  const savedAs = new Map<string, string>();
  for (const r of result.rows) {
    if (!r.is_own && r.label !== null && r.label !== '' && !savedAs.has(r.digits))
      savedAs.set(r.digits, r.label);
  }
  return { own, savedAs };
}

/** The owner first, then his own contacts, then the rest; one row per number. */
export function bridgesFor(
  ties: readonly TieRow[],
  owner: OwnerView,
  exclusions: ReadonlyMap<string, ContactExclusion[]>,
): BaseBridge[] {
  const rank = (b: BaseBridge): number =>
    b.is_you === true ? 0 : b.you_saved_as !== undefined ? 1 : 2;
  const byNumber = new Map<string, BaseBridge>();
  for (const t of ties) {
    const digits = phoneDigits(t.phone);
    if (byNumber.has(digits)) continue;
    const savedAs = owner.savedAs.get(digits);
    const excluded = exclusions.get(digits);
    byNumber.set(digits, {
      name: t.name,
      tie: t.tie,
      phone: t.phone,
      ...(owner.own.has(digits) && { is_you: true as const }),
      ...(savedAs !== undefined && { you_saved_as: savedAs }),
      ...(excluded !== undefined && { excluded }),
    });
  }
  return [...byNumber.values()].sort((a, b) => rank(a) - rank(b)).slice(0, MAX_BRIDGES_PER_PERSON);
}

function personOf(
  hit: PersonHit,
  facts: readonly FactRow[],
  ties: readonly TieRow[],
  owner: OwnerView,
  exclusions: ReadonlyMap<string, ContactExclusion[]>,
): BasePerson {
  const savedAs = hit.phone === null ? undefined : owner.savedAs.get(phoneDigits(hit.phone));
  return {
    name: hit.name,
    has_number: hit.phone !== null,
    ...(hit.phone !== null && { phone: hit.phone }),
    ...(savedAs !== undefined && { you_saved_as: savedAs }),
    facts: facts
      .filter((f) => f.person_key === hit.person_key)
      .slice(0, MAX_FACTS_PER_PERSON)
      .map((f) => ({ key: f.key, value: f.value })),
    known_by: bridgesFor(
      ties.filter((t) => t.person_key === hit.person_key),
      owner,
      exclusions,
    ),
  };
}

export async function findPeopleInBase(
  userId: string,
  need: string,
): Promise<FindPeopleInBaseResult> {
  const words = needWords(need);
  const { place, trade } = placeAndTrade(words, words.length === 0 ? [] : await readPlaces());
  const hits = trade.length === 0 ? [] : await readHits(trade, place);
  const keys = hits.map((h) => h.person_key);
  const [facts, ties] =
    keys.length === 0 ? [[], []] : await Promise.all([readFacts(keys), readBridges(keys)]);
  const phones = [
    ...ties.map((t) => t.phone),
    ...hits.map((h) => h.phone).filter((p): p is string => p !== null),
  ];
  const [owner, exclusions] = await Promise.all([
    readOwnerView(userId, phones),
    fetchExclusionsForPhones(userId, phones),
  ]);
  return {
    words,
    place,
    people: hits.map((h) => personOf(h, facts, ties, owner, exclusions)),
    note: NOTE,
  };
}
