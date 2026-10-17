import { query } from '../db/postgres/client';

/**
 * 4126 (D757 §3) and §119.4's read step: the researched facts about one
 * person, as the model reads them — each with how sure it is, where it was
 * found and when. Research facts are written private and unmatchable (§119.1);
 * this is the one place they are read for an answer.
 *
 * The note is MODEL-FACING, Misho's yes word for word on 12 Oct (§129):
 * 6b and 6c.
 */
export const RESEARCH_FACTS_NOTE =
  'A fact marked possible comes from one source. Say it as possible, with where and when it was ' +
  'found — „possibly works at X (per site.ge, March 2025)" — never as certain. When you are not ' +
  'sure a contact still works where a fact says, ask the owner one short question before relying ' +
  'on it.';

export const RESEARCH_SOURCE = 'public_research';
/** §119.4: confirmed and possible facts find their person; a rough one is only a hint. */
export const MATCHED_RESEARCH_STATUSES: readonly string[] = ['confirmed', 'possible'];
/** Research facts shown per person a search found. */
const MAX_FACTS_PER_FOUND_PERSON = 5;
/** The search result holds at most this many people, so this many phones are read. */
const MAX_PHONES_READ = 100;
const MAX_RESEARCH_FACTS = 20;
const QUERY_TIMEOUT_MS = 8_000;

export interface ResearchFactView {
  readonly field_type: string;
  readonly value: string;
  /** confirmed | possible | rough | unknown */
  readonly status: string | null;
  readonly source_url: string | null;
  readonly found_on: string | null;
  readonly conflict: string | null;
}

/** The person's researched facts that stand: not retracted, not removed by the person. */
export async function researchFactsFor(phone: string): Promise<ResearchFactView[]> {
  const result = await query<ResearchFactView>(
    `SELECT field_type, value, research_status AS status, source_url,
            TO_CHAR(COALESCE(fact_date, created_at::date), 'YYYY-MM-DD') AS found_on,
            conflict_note AS conflict
       FROM contact_facts
      WHERE neo4j_contact_id = $1 AND source = $2
        AND retracted_at IS NULL AND removed_by_subject_at IS NULL
      ORDER BY (research_status = 'confirmed') DESC, field_type
      LIMIT $3`,
    [phone, RESEARCH_SOURCE, MAX_RESEARCH_FACTS],
    QUERY_TIMEOUT_MS,
  );
  return result.rows;
}

/** The research part of a contact's facts, with its note; nothing when there is none. */
export async function researchPartOf(
  phone: string,
): Promise<{ research?: ResearchFactView[]; research_note?: string }> {
  const research = await researchFactsFor(phone);
  return research.length === 0 ? {} : { research, research_note: RESEARCH_FACTS_NOTE };
}

/**
 * 4225: the confirmed and possible research facts of the people a search
 * found, read once for the whole result. Never rough ones (§119.4).
 */
export async function researchFactsForPhones(
  phones: readonly string[],
): Promise<Map<string, ResearchFactView[]>> {
  const byPhone = new Map<string, ResearchFactView[]>();
  if (phones.length === 0) return byPhone;
  const result = await query<ResearchFactView & { phone: string }>(
    `SELECT phone, field_type, value, status, source_url, found_on, conflict
       FROM (
         SELECT neo4j_contact_id AS phone, field_type, value, research_status AS status,
                source_url, TO_CHAR(COALESCE(fact_date, created_at::date), 'YYYY-MM-DD') AS found_on,
                conflict_note AS conflict,
                ROW_NUMBER() OVER (PARTITION BY neo4j_contact_id
                                   ORDER BY (research_status = 'confirmed') DESC, field_type) AS n
           FROM contact_facts
          WHERE neo4j_contact_id = ANY($1::text[]) AND source = $2
            AND research_status = ANY($3::text[])
            AND retracted_at IS NULL AND removed_by_subject_at IS NULL
       ) ranked
      WHERE n <= $4`,
    [
      phones.slice(0, MAX_PHONES_READ),
      RESEARCH_SOURCE,
      MATCHED_RESEARCH_STATUSES,
      MAX_FACTS_PER_FOUND_PERSON,
    ],
    QUERY_TIMEOUT_MS,
  );
  for (const { phone, ...fact } of result.rows) {
    byPhone.set(phone, [...(byPhone.get(phone) ?? []), fact]);
  }
  return byPhone;
}
