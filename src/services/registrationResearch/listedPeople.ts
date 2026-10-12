import { KnownPerson, ListPerson, sameNamePerson, storeListPerson } from '../listPeople.service';

/**
 * 4126 item 3, the missing half: the list_people table (f8d0dbf) was built and
 * nothing ever wrote to it. The registration run reads pages about a new user;
 * when one of them is a public member, staff or attendee list, the people it
 * names are kept in list_people — who belongs to which organisation, by which
 * page, on which day — and never as a „knows" link (D757 point 2).
 *
 * OFF until Misho says yes to LIST_PEOPLE_BRIEF word for word (D44): it is
 * added to the extractor's brief only while this is on, so the live brief does
 * not change by one character until then.
 */
export const LIST_PEOPLE_ON = false;

/** MODEL-FACING (D44): appended to REGISTRATION_EXTRACT_BRIEF only while LIST_PEOPLE_ON. */
export const LIST_PEOPLE_BRIEF =
  'If one of the texts is a public list of the people who belong to an organisation (members, ' +
  'staff, a board, attendees), also return the people it lists, under "listed_people": ' +
  '[{"name": "...", "organisation": "...", "role": "..." | null, "source": "https://..."}]. ' +
  'Copy each name and role exactly as the list writes it. Being on the same list says nothing ' +
  'about who knows whom: never turn it into a fact about this person.';

/** Work facts that name an organisation the person belongs to. */
const ORGANISATION_FACT_KEYS: ReadonlySet<string> = new Set(['employer', 'affiliation']);
const MAX_LISTED_PER_RUN = 200;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function asListPerson(value: unknown, checkedOn: string): ListPerson | null {
  if (!isRecord(value)) return null;
  const { name, organisation, role, source } = value;
  if (typeof name !== 'string' || typeof organisation !== 'string') return null;
  if (typeof source !== 'string') return null;
  return {
    name,
    organisation,
    listedRole: typeof role === 'string' ? role : null,
    sourceUrl: source,
    checkedOn,
  };
}

/**
 * The listed people in the extractor's parsed reply; none unless it was sure
 * the texts are about this person (the same gate its facts pass).
 */
export function listedPeopleIn(parsed: unknown, checkedOn: string): ListPerson[] {
  if (!isRecord(parsed) || parsed.same_person !== true) return [];
  const raw = parsed.listed_people;
  if (!Array.isArray(raw)) return [];
  return raw
    .slice(0, MAX_LISTED_PER_RUN)
    .map((entry: unknown) => asListPerson(entry, checkedOn))
    .filter((p): p is ListPerson => p !== null);
}

/** The new user as the same-name check sees them: their number, name and organisations found. */
export function newUserAsKnown(
  phone: string,
  name: string,
  facts: readonly { readonly key: string; readonly value: string }[],
): KnownPerson {
  return {
    phone,
    name,
    organisations: facts.filter((f) => ORGANISATION_FACT_KEYS.has(f.key)).map((f) => f.value),
  };
}

/**
 * Stores each listed person once. Only the new user's own entry can join a
 * number, and only when name and organisation both match; everybody else on
 * the list is kept unmatched. Returns how many rows were new.
 */
export async function storeListedPeople(
  listed: readonly ListPerson[],
  newUser: KnownPerson,
): Promise<number> {
  let stored = 0;
  for (const person of listed) {
    if (await storeListPerson(person, sameNamePerson(person, [newUser]))) stored += 1;
  }
  return stored;
}
