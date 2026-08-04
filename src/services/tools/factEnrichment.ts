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
}

const ENRICH_TIMEOUT_MS = 8_000;

function emptyFields(): ContactFactFields {
  return { employer: null, jobPosition: null, city: null, industry: null, dates: {} };
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

  const result = await query<{ phone: string; field_type: string; value: string; as_of: string }>(
    `SELECT neo4j_contact_id AS phone, field_type,
            COALESCE(canonical_value, value) AS value,
            TO_CHAR(updated_at, 'YYYY-MM-DD') AS as_of
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
    if (row.field_type === 'employer' && !entry.employer) {
      entry.employer = row.value;
      entry.dates.employer = row.as_of;
    } else if (row.field_type === 'occupation' && !entry.jobPosition) {
      entry.jobPosition = row.value;
      entry.dates.jobPosition = row.as_of;
    } else if (row.field_type === 'city' && !entry.city) {
      entry.city = row.value;
      entry.dates.city = row.as_of;
    } else if (row.field_type === 'industry' && !entry.industry) {
      entry.industry = row.value;
      entry.dates.industry = row.as_of;
    }
    map.set(key, entry);
  }
  return map;
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
  const asOf: Partial<Record<FactDateField, string>> = {};
  if (!row.employer && f.employer && f.dates.employer) asOf.employer = f.dates.employer;
  if (!row.jobPosition && f.jobPosition && f.dates.jobPosition)
    asOf.jobPosition = f.dates.jobPosition;
  if (!row.city && f.city && f.dates.city) asOf.city = f.dates.city;
  if (f.industry && f.dates.industry) asOf.industry = f.dates.industry;
  return {
    ...row,
    employer: row.employer || f.employer,
    jobPosition: row.jobPosition || f.jobPosition,
    city: row.city || f.city,
    ...(f.industry ? { industry: f.industry } : {}),
    ...(Object.keys(asOf).length > 0 ? { facts_as_of: asOf } : {}),
  };
}
