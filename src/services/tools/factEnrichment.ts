import { query } from '../../db/postgres/client';
import { normalizePhone } from '../phone';

type FactDateField = 'employer' | 'jobPosition' | 'city' | 'industry';

export interface ContactFactFields {
  employer: string | null;
  jobPosition: string | null;
  city: string | null;
  industry: string | null;
  // YYYY-MM-DD each fact was last saved/confirmed — a stale role must be
  // VISIBLY stale (two 2013 city-hall leavers were offered as live routes).
  dates: Partial<Record<FactDateField, string>>;
  /** 4226: the fields whose value is the searching owner's own saved word. */
  own: Partial<Record<FactDateField, true>>;
  /** Box 54172: the Georgian spelling the owner saved for this contact, never another's. */
  georgianName: string | null;
}

const ENRICH_TIMEOUT_MS = 8_000;

function emptyFields(): ContactFactFields {
  return {
    employer: null,
    jobPosition: null,
    city: null,
    industry: null,
    dates: {},
    own: {},
    georgianName: null,
  };
}

/**
 * Saved facts (the user's own + crowd-confirmed public) for a set of contact
 * phones, keyed by NORMALIZED phone. Search rows carry raw phones and facts
 * store normalized ones, so both sides are normalized before matching. Lets a
 * search result show employer/occupation/city without a per-contact profile
 * round-trip (ISSUE 7).
 */
export async function fetchFactsForPhones(
  userId: string,
  phones: string[],
): Promise<Map<string, ContactFactFields>> {
  const map = new Map<string, ContactFactFields>();
  const normalized = [...new Set(phones.map(normalizePhone))];
  if (normalized.length === 0) return map;

  const result = await query<{
    phone: string;
    field_type: string;
    value: string;
    as_of: string;
    own: boolean;
  }>(
    `SELECT neo4j_contact_id AS phone, field_type,
            COALESCE(canonical_value, value) AS value,
            TO_CHAR(updated_at, 'YYYY-MM-DD') AS as_of,
            (submitted_by_user_id = $2) AS own
     FROM contact_facts
     WHERE neo4j_contact_id = ANY($1)
       AND (submitted_by_user_id = $2 OR is_public = true)
       AND retracted_at IS NULL
     ORDER BY (submitted_by_user_id = $2) DESC`,
    [normalized, userId],
    ENRICH_TIMEOUT_MS,
  );

  for (const row of result.rows) {
    const key = normalizePhone(row.phone);
    const entry = map.get(key) ?? emptyFields();
    if (row.field_type === GEORGIAN_NAME_TYPE && row.own && entry.georgianName === null) {
      entry.georgianName = row.value.trim() || null;
    }
    const field = FIELD_OF_TYPE[row.field_type];
    if (field !== undefined && !entry[field]) {
      entry[field] = row.value;
      entry.dates[field] = row.as_of;
      if (row.own) entry.own[field] = true;
    }
    map.set(key, entry);
  }
  return map;
}

/**
 * Box 54172/54173 (Tornike, 12 Oct): two Georgian surnames came out wrong
 * („ც" written „წ"), because the writer saw only the Latin label and spelled it
 * in Georgian itself. The owner had saved the right spelling as a
 * `georgian_name` fact (257 contacts, 7 Oct), and nothing read it. A Latin name
 * now gives way to the Georgian spelling the owner saved.
 */
const GEORGIAN_NAME_TYPE = 'georgian_name';
const GEORGIAN_LETTER_RE = /\p{Script=Georgian}/u;

/** The name to show: the owner's saved Georgian spelling when the name has no Georgian letters. */
export function nameAsSpelled(name: string | null, georgianName: string | null): string | null {
  if (georgianName === null) return name;
  return name !== null && GEORGIAN_LETTER_RE.test(name) ? name : georgianName;
}

const FIELD_OF_TYPE: Readonly<Record<string, FactDateField>> = {
  employer: 'employer',
  occupation: 'jobPosition',
  city: 'city',
  industry: 'industry',
};

/**
 * 4226 (the founder's account, 9 Oct; D742): for a contact with an old Ally
 * account, the person's own old profile (employer, job title on "User") hid
 * every fact the owner saved — „that is no longer his job" could not be said.
 * The owner's own word about his contact wins over that old profile; a fact
 * somebody else made public still only fills a field the profile left empty.
 */
function factWins(
  f: ContactFactFields,
  field: FactDateField,
  profileValue: string | null,
): boolean {
  return Boolean(f[field]) && (f.own[field] === true || !profileValue);
}

function withGeorgianSpelling(
  row: object,
  georgianName: string | null,
): { name?: string | null; georgian_name?: string } {
  if (georgianName === null) return {};
  const shown = (row as { name?: unknown }).name;
  const name = typeof shown === 'string' ? shown : null;
  return { name: nameAsSpelled(name, georgianName), georgian_name: georgianName };
}

export interface CurrentWork {
  readonly employer?: string;
  readonly jobPosition?: string;
  readonly city?: string;
  readonly facts_as_of?: Partial<Record<FactDateField, string>>;
}

/**
 * 4491 (box 54451, 0 of 3): „who used to work at TBC Bank?" found Bakhva by his
 * past_role fact, and the run asked the owner where he works now — the
 * employer fact he had just saved never reached it, because an insight hit
 * carries only the facts that matched the query words. The same fields a name
 * search carries, from the same facts, ride on the hit; a field with nothing
 * saved is left out.
 */
export function currentWorkOf(phone: string, facts: Map<string, ContactFactFields>): CurrentWork {
  const f = facts.get(normalizePhone(phone));
  if (!f) return {};
  const asOf: Partial<Record<FactDateField, string>> = {};
  const out: { employer?: string; jobPosition?: string; city?: string } = {};
  for (const field of ['employer', 'jobPosition', 'city'] as const) {
    const value = f[field];
    if (!value) continue;
    out[field] = value;
    if (f.dates[field]) asOf[field] = f.dates[field];
  }
  return { ...out, ...(Object.keys(asOf).length > 0 ? { facts_as_of: asOf } : {}) };
}

/** Overlay saved-fact fields onto a search row, keeping any non-empty existing value. */
export function applyFacts<
  T extends {
    phone: string;
    employer: string | null;
    jobPosition: string | null;
    city: string | null;
  },
>(
  row: T,
  facts: Map<string, ContactFactFields>,
): T & { industry?: string | null; facts_as_of?: Partial<Record<FactDateField, string>> } {
  const f = facts.get(normalizePhone(row.phone));
  if (!f) return row;
  // Date rides ONLY for fields actually filled from a saved fact — it states
  // when THAT value was last confirmed, so the model can hedge on stale roles.
  const useEmployer = factWins(f, 'employer', row.employer);
  const useJob = factWins(f, 'jobPosition', row.jobPosition);
  const useCity = factWins(f, 'city', row.city);
  const asOf: Partial<Record<FactDateField, string>> = {};
  if (useEmployer && f.dates.employer) asOf.employer = f.dates.employer;
  if (useJob && f.dates.jobPosition) asOf.jobPosition = f.dates.jobPosition;
  if (useCity && f.dates.city) asOf.city = f.dates.city;
  if (f.industry && f.dates.industry) asOf.industry = f.dates.industry;
  return {
    ...row,
    ...withGeorgianSpelling(row, f.georgianName),
    employer: useEmployer ? f.employer : row.employer,
    jobPosition: useJob ? f.jobPosition : row.jobPosition,
    city: useCity ? f.city : row.city,
    ...(f.industry ? { industry: f.industry } : {}),
    ...(Object.keys(asOf).length > 0 ? { facts_as_of: asOf } : {}),
  };
}
