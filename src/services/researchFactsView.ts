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

const RESEARCH_SOURCE = 'public_research';
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
