import { query } from '../../db/postgres/client';
import { notAnExcludedHolder } from '../excludedHolders.service';
import { wordPatterns } from '../farCircles.service';
import { MATCHED_RESEARCH_STATUSES, RESEARCH_SOURCE } from '../researchFactsView';

/**
 * Misho, 13 Nov (search stage 4): „who needs a mobile app" — the people whose
 * stated NEED matches, in the owner's own phonebook, one ring out, and
 * anywhere else in the base. The other searches find who DOES something; this
 * one finds who is LOOKING for it (a seller's clients, an investor's founders).
 */

/** The fact kind a need is saved under. */
const NEED_FACT_TYPE = 'need';
/** Needs read before they are put in rings; the shown list is shorter. */
const NEEDS_READ = 60;
/** People shown, nearest ring first. */
export const NEEDS_SHOWN = 10;
const NEEDS_QUERY_TIMEOUT_MS = 8000;

export enum NeedLevel {
  Own = 'own',
  Second = 'second',
  Further = 'further',
}

export interface NeedHit {
  readonly phone: string;
  /** The owner's own label, or the member's registered name; null when neither. */
  readonly name: string | null;
  readonly level: NeedLevel;
  /** The need's words when they may be shown; null for a private, matchable one. */
  readonly need: string | null;
  /** For a second-circle person, the owner's label for the contact who knows them. */
  readonly via: string | null;
}

export interface SearchNeedsResult {
  readonly results: readonly NeedHit[];
  readonly note: string;
}

export interface NeedRow {
  readonly phone: string;
  readonly shown: string | null;
  readonly own_name: string | null;
  readonly in_own_book: boolean;
  readonly registered_name: string | null;
  readonly via_name: string | null;
  readonly via_holds: boolean;
}

export const NEEDS_NOTE =
  'People who are LOOKING for this (their need matches), not people who do it. level own: in ' +
  "the user's phonebook; second: known by the contact named in via; further: elsewhere in the " +
  'base — call find_warm_path with their phone id for the way in. A need of null matched but ' +
  'is private: say only that they are looking for something in this area, never guess or quote it.';

/**
 * Who has a need matching the words: the need's words when they may be shown
 * (public, or saved by the owner), the owner's own label, the registered
 * name, and the owner's contact who holds them, if any. Same visibility rule
 * as every other search (searchableData): public or matchable facts, research
 * confirmed or possible, never a removed or retracted one.
 */
const NEEDS_SQL = `WITH needs AS (
     SELECT DISTINCT ON (cf.neo4j_contact_id) cf.neo4j_contact_id AS phone,
            CASE WHEN cf.is_public OR cf.submitted_by_user_id = $1::text THEN cf.value END AS shown
       FROM contact_facts cf
      WHERE cf.field_type = $3
        AND cf.retracted_at IS NULL
        AND cf.removed_by_subject_at IS NULL
        AND (cf.is_public OR cf.is_matchable
             OR (cf.source = $4 AND cf.research_status = ANY($5::text[])))
        AND NOT (cf.source = $4 AND cf.research_status <> ALL($5::text[]))
        AND normalize_search_token(COALESCE(cf.canonical_value, cf.value)) LIKE ALL($2::text[])
        AND NOT EXISTS (SELECT 1 FROM "UserPhone" me WHERE me."userId" = $1::int AND me.phone = cf.neo4j_contact_id)
      ORDER BY cf.neo4j_contact_id, cf.is_public DESC, cf.id DESC
      LIMIT $6)
   SELECT n.phone, n.shown, own.alias AS own_name, COALESCE(own.mine, FALSE) AS in_own_book, reg.name AS registered_name,
          sec.via AS via_name, COALESCE(sec.held, FALSE) AS via_holds
     FROM needs n
     LEFT JOIN LATERAL (
       SELECT NULLIF(TRIM(a.alias), '') AS alias, TRUE AS mine FROM "UserAlias" a
        WHERE a."contactId" = $1::int AND a.phone = n.phone
        ORDER BY a.id DESC LIMIT 1) own ON TRUE
     LEFT JOIN LATERAL (
       SELECT u.name FROM "UserPhone" up JOIN "User" u ON u.id = up."userId"
        WHERE up.phone = n.phone AND u."deletedAt" IS NULL LIMIT 1) reg ON TRUE
     LEFT JOIN LATERAL (
       SELECT NULLIF(TRIM(mine.alias), '') AS via, TRUE AS held
         FROM "UserAlias" mine
         JOIN "UserPhone" bp ON bp.phone = mine.phone
         JOIN "UserAlias" theirs ON theirs."contactId" = bp."userId" AND theirs.phone = n.phone
        WHERE mine."contactId" = $1::int AND own.mine IS NULL
          AND ${notAnExcludedHolder('bp."userId"')}
        ORDER BY mine.id DESC LIMIT 1) sec ON TRUE`;

/** The ring a row sits in: the owner's own phonebook, a contact's, or neither. */
export function needLevel(row: Pick<NeedRow, 'in_own_book' | 'via_holds'>): NeedLevel {
  if (row.in_own_book) return NeedLevel.Own;
  return row.via_holds ? NeedLevel.Second : NeedLevel.Further;
}

const LEVEL_ORDER: readonly NeedLevel[] = [NeedLevel.Own, NeedLevel.Second, NeedLevel.Further];

/** One row as shown: nearest ring first, the owner's own label before a registered name. */
export function needHit(row: NeedRow): NeedHit {
  const level = needLevel(row);
  return {
    phone: row.phone,
    name: row.own_name ?? row.registered_name,
    level,
    need: row.shown,
    via: level === NeedLevel.Second ? row.via_name : null,
  };
}

export function nearestFirst(hits: readonly NeedHit[]): NeedHit[] {
  return [...hits]
    .sort((a, b) => LEVEL_ORDER.indexOf(a.level) - LEVEL_ORDER.indexOf(b.level))
    .slice(0, NEEDS_SHOWN);
}

export async function searchNeeds(userId: string, words: string): Promise<SearchNeedsResult> {
  const patterns = wordPatterns(words);
  if (patterns.length === 0) return { results: [], note: NEEDS_NOTE };
  const result = await query<NeedRow>(
    NEEDS_SQL,
    [userId, patterns, NEED_FACT_TYPE, RESEARCH_SOURCE, MATCHED_RESEARCH_STATUSES, NEEDS_READ],
    NEEDS_QUERY_TIMEOUT_MS,
  );
  return { results: nearestFirst(result.rows.map(needHit)), note: NEEDS_NOTE };
}
