import { query } from '../../db/postgres/client';

/**
 * #7758 (tester 79008/79009; the founder, 30 Oct): an ex-Axel member came back
 * from the name search with no sign that he had left, and the model called the
 * community his likely employer. The groups a found person belongs to now
 * reach the result, each marked current or former, with a note that a
 * community is not an employer.
 *
 * A current member holds a live `member_of` fact; a former one, the roster's
 * „<group> (former member)" affiliation (roster.service). Public roster facts
 * only, the ones the roster itself writes.
 */
const MAX_ROWS_READ = 10;
const QUERY_TIMEOUT_MS = 4_000;
const FORMER_SUFFIX = ' (former member)';

export enum CommunityStatus {
  Current = 'current',
  Former = 'former',
}

export interface Community {
  readonly name: string;
  readonly status: CommunityStatus;
}

export const COMMUNITIES_NOTE =
  'communities are groups this person belongs to now (current) or used to (former). A ' +
  'community is never an employer: do not say they work there, and say a former member is one.';

interface FactRow {
  readonly phone: string;
  readonly field_type: string;
  readonly value: string;
}

/** Pure: each phone's groups, a live membership winning over a former mark of the same group. */
export function communitiesByPhone(rows: readonly FactRow[]): Map<string, Community[]> {
  const byPhone = new Map<string, Map<string, CommunityStatus>>();
  for (const r of rows) {
    const former = r.field_type !== 'member_of';
    const name = former ? r.value.slice(0, -FORMER_SUFFIX.length).trim() : r.value.trim();
    if (name === '') continue;
    const groups = byPhone.get(r.phone) ?? new Map<string, CommunityStatus>();
    if (!former || !groups.has(name)) {
      groups.set(name, former ? CommunityStatus.Former : CommunityStatus.Current);
    }
    byPhone.set(r.phone, groups);
  }
  return new Map(
    [...byPhone].map(([phone, groups]) => [
      phone,
      [...groups].map(([name, status]) => ({ name, status })),
    ]),
  );
}

async function communityFacts(phones: readonly string[]): Promise<FactRow[]> {
  const result = await query<FactRow>(
    `SELECT neo4j_contact_id AS phone, field_type, value FROM contact_facts
      WHERE neo4j_contact_id = ANY($1::text[]) AND retracted_at IS NULL AND is_public
        AND (field_type = 'member_of'
             OR (field_type = 'affiliation' AND value LIKE $2))
      LIMIT $3`,
    [phones, `%${FORMER_SUFFIX}`, phones.length * MAX_ROWS_READ],
    QUERY_TIMEOUT_MS,
  );
  return result.rows;
}

interface SearchRow {
  readonly phone?: unknown;
}

/** The name search's result with each row's communities; unchanged when there are none. */
export async function withCommunities(found: object): Promise<object> {
  const results = (found as { results?: unknown }).results;
  if (!Array.isArray(results)) return found;
  const rows = results as SearchRow[];
  const phones = rows
    .slice(0, MAX_ROWS_READ)
    .map((r) => r.phone)
    .filter((p): p is string => typeof p === 'string' && p !== '');
  if (phones.length === 0) return found;
  try {
    const groups = communitiesByPhone(await communityFacts(phones));
    if (groups.size === 0) return found;
    const withGroups = rows.map((row) => {
      const mine = typeof row.phone === 'string' ? groups.get(row.phone) : undefined;
      return mine === undefined ? row : { ...row, communities: mine };
    });
    return { ...found, results: withGroups, communities_note: COMMUNITIES_NOTE };
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[communities] not read:', (err as Error).message);
    return found;
  }
}
