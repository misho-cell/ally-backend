import { query } from '../db/postgres/client';

/**
 * 4126 item 3 (D757 point 2; Misho's yes §133): people found on public member
 * lists, kept apart from contacts and users. A list says who belongs to an
 * organisation, never who knows whom: nothing here is a „knows" link or an
 * introduction route, and a row joins a known person only when the same-name
 * check below leaves no doubt.
 */
const MAX_NAME_CHARS = 200;
const MAX_ORGANISATION_CHARS = 200;
const MAX_ROLE_CHARS = 200;
const MAX_URL_CHARS = 1_000;
const QUERY_TIMEOUT_MS = 5_000;
const URL_RE = /^https?:\/\/\S+$/u;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/u;
const SPACES_RE = /\s+/gu;

export interface ListPerson {
  readonly name: string;
  readonly organisation: string;
  readonly listedRole: string | null;
  readonly sourceUrl: string;
  /** YYYY-MM-DD, the day the list was read. */
  readonly checkedOn: string;
}

/** A known person the list entry might be: their number, name, and the organisations on record. */
export interface KnownPerson {
  readonly phone: string;
  readonly name: string;
  readonly organisations: readonly string[];
}

function plain(text: string): string {
  return text.trim().replace(SPACES_RE, ' ').toLocaleLowerCase();
}

/** The entry as it may be stored, or null when a field is missing or malformed. */
export function usableListPerson(person: ListPerson): ListPerson | null {
  const name = person.name.trim().replace(SPACES_RE, ' ');
  const organisation = person.organisation.trim().replace(SPACES_RE, ' ');
  const role = person.listedRole?.trim() ?? '';
  const url = person.sourceUrl.trim();
  if (name === '' || name.length > MAX_NAME_CHARS) return null;
  if (organisation === '' || organisation.length > MAX_ORGANISATION_CHARS) return null;
  if (!URL_RE.test(url) || url.length > MAX_URL_CHARS) return null;
  if (!DATE_RE.test(person.checkedOn)) return null;
  return {
    name,
    organisation,
    listedRole: role === '' ? null : role.slice(0, MAX_ROLE_CHARS),
    sourceUrl: url,
    checkedOn: person.checkedOn,
  };
}

/**
 * The same-name check. The entry joins a known person only when exactly one
 * candidate has the same full name AND the same organisation on record; a
 * shared name alone, or two such candidates, leaves it unmerged.
 */
export function sameNamePerson(
  person: ListPerson,
  candidates: readonly KnownPerson[],
): string | null {
  const name = plain(person.name);
  const organisation = plain(person.organisation);
  const matches = candidates.filter(
    (c) => plain(c.name) === name && c.organisations.some((o) => plain(o) === organisation),
  );
  const phones = new Set(matches.map((c) => c.phone));
  return phones.size === 1 ? [...phones][0] : null;
}

/** Stores one entry once; true when it is new. A malformed entry is refused. */
export async function storeListPerson(
  person: ListPerson,
  matchedPhone: string | null,
): Promise<boolean> {
  const usable = usableListPerson(person);
  if (usable === null) return false;
  const result = await query(
    `INSERT INTO list_people (name, organisation, listed_role, source_url, checked_on, matched_phone)
     VALUES ($1, $2, $3, $4, $5::date, $6)
     ON CONFLICT DO NOTHING`,
    [
      usable.name,
      usable.organisation,
      usable.listedRole,
      usable.sourceUrl,
      usable.checkedOn,
      matchedPhone,
    ],
    QUERY_TIMEOUT_MS,
  );
  return (result.rowCount ?? 0) > 0;
}
