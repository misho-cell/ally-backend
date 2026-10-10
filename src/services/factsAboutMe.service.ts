import { query } from '../db/postgres/client';
import { normalizePhone } from './phone';

/**
 * 4126 item 5 (Misho's yes, 9 Oct ~20:48 UTC): a person sees every fact kept
 * about their own numbers — researched, read from labels, or saved by someone
 * — with its source and date, and removes any of them.
 *
 * WHO SAVED A FACT IS NEVER SAID. The list carries what kind of source it is,
 * never the saver: telling a person which contact wrote what about them would
 * disclose the saver's phonebook and words.
 *
 * A removal holds: the row is retracted, made private and unmatchable, and
 * marked removed_by_subject_at, which the savers' upsert and the research
 * reload both respect.
 */
const QUERY_TIMEOUT_MS = 5_000;
const OWN_NUMBERS_READ = 20;
export const FACTS_ABOUT_ME_MAX = 200;
const RESEARCH_SOURCE = 'public_research';
const LABEL_SOURCE = 'label';

export enum FactOrigin {
  Research = 'research',
  Label = 'label',
  SavedBySomeone = 'saved_by_someone',
}

export interface FactAboutMe {
  readonly id: number;
  readonly field: string;
  readonly value: string;
  readonly origin: FactOrigin;
  /** The page it was read on, for a researched fact. */
  readonly source_url: string | null;
  /** When the source dated it, or when it was saved. */
  readonly date: string;
  /** confirmed / possible / rough / unknown, for a researched fact. */
  readonly status: string | null;
}

interface FactRow {
  readonly id: number;
  readonly field_type: string;
  readonly value: string;
  readonly source: string | null;
  readonly source_url: string | null;
  readonly fact_date: string | null;
  readonly saved_on: string;
  readonly research_status: string | null;
}

/** The person's own numbers, in the form contact_facts keys them. */
async function ownNumbers(userId: number): Promise<string[]> {
  const result = await query<{ phone: string }>(
    `SELECT phone FROM "UserPhone" WHERE "userId" = $1 LIMIT $2`,
    [userId, OWN_NUMBERS_READ],
    QUERY_TIMEOUT_MS,
  );
  return [...new Set(result.rows.map((r) => normalizePhone(r.phone)).filter((p) => p !== ''))];
}

export function originOf(source: string | null): FactOrigin {
  if (source === RESEARCH_SOURCE) return FactOrigin.Research;
  if (source === LABEL_SOURCE) return FactOrigin.Label;
  return FactOrigin.SavedBySomeone;
}

function toFactAboutMe(row: FactRow): FactAboutMe {
  return {
    id: row.id,
    field: row.field_type,
    value: row.value,
    origin: originOf(row.source),
    source_url: row.source_url,
    date: row.fact_date ?? row.saved_on,
    status: row.research_status,
  };
}

export async function factsAboutMe(userId: number): Promise<FactAboutMe[]> {
  const numbers = await ownNumbers(userId);
  if (numbers.length === 0) return [];
  const result = await query<FactRow>(
    `SELECT id, field_type, value, source, source_url,
            TO_CHAR(fact_date, 'YYYY-MM-DD') AS fact_date,
            TO_CHAR(COALESCE(updated_at, created_at), 'YYYY-MM-DD') AS saved_on,
            research_status
       FROM contact_facts
      WHERE neo4j_contact_id = ANY($1::text[]) AND retracted_at IS NULL
      ORDER BY COALESCE(updated_at, created_at) DESC
      LIMIT $2`,
    [numbers, FACTS_ABOUT_ME_MAX],
    QUERY_TIMEOUT_MS,
  );
  return result.rows.map(toFactAboutMe);
}

export enum RemoveOutcome {
  Removed = 'removed',
  /** No such fact about this person's numbers — including another person's fact. */
  NotFound = 'not_found',
}

export async function removeFactAboutMe(userId: number, factId: number): Promise<RemoveOutcome> {
  const numbers = await ownNumbers(userId);
  if (numbers.length === 0) return RemoveOutcome.NotFound;
  const result = await query(
    `UPDATE contact_facts
        SET retracted_at = NOW(), removed_by_subject_at = NOW(), is_public = false,
            is_matchable = false, updated_at = NOW()
      WHERE id = $1 AND neo4j_contact_id = ANY($2::text[]) AND retracted_at IS NULL`,
    [factId, numbers],
    QUERY_TIMEOUT_MS,
  );
  return (result.rowCount ?? 0) > 0 ? RemoveOutcome.Removed : RemoveOutcome.NotFound;
}
