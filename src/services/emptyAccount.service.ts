import { query, withTransaction } from '../db/postgres/client';

/**
 * Misho, 9 Oct ~22:43Z, through the operations session: „ცარიელი ანგარიშები
 * წაშალე" — the two accounts the seat-maker clash of 11:23Z left behind,
 * with no number, no seat and nothing in them (§120).
 *
 * The rule is written so it cannot delete a person: the User row goes only
 * when NO table holds anything for that id. The tables are read from the
 * catalogue, not listed by hand, so a table added next month is checked too.
 * Any row anywhere is a refusal that names the table. The log of erasures
 * itself is not a reason to keep an account.
 */
const QUERY_TIMEOUT_MS = 8_000;

const USER_COLUMNS: readonly string[] = [
  'user_id',
  'userId',
  'owner_id',
  'from_user_id',
  'to_user_id',
  'contactId',
  'originUserId',
  'invited_user_id',
];

const NOT_A_HOLDER: ReadonlySet<string> = new Set(['erasure_log']);

export enum EmptyDeleteOutcome {
  Deleted = 'deleted',
  NotFound = 'not_found',
  NotEmpty = 'not_empty',
}

export interface EmptyDeleteResult {
  readonly outcome: EmptyDeleteOutcome;
  /** For not_empty: the tables that hold something for this id. */
  readonly holding?: readonly string[];
}

interface UserColumn {
  readonly table_name: string;
  readonly column_name: string;
  readonly data_type: string;
}

const INTEGER_TYPES: ReadonlySet<string> = new Set(['integer', 'bigint', 'smallint']);

async function userColumns(): Promise<UserColumn[]> {
  const result = await query<UserColumn>(
    `SELECT table_name, column_name, data_type FROM information_schema.columns
      WHERE table_schema = 'public' AND column_name = ANY($1) AND table_name <> 'User'`,
    [USER_COLUMNS],
    QUERY_TIMEOUT_MS,
  );
  return result.rows.filter((c) => !NOT_A_HOLDER.has(c.table_name));
}

/** A catalogue name, quoted as an identifier; never text from a request. */
function ident(name: string): string {
  return `"${name.replace(/"/gu, '""')}"`;
}

/**
 * The tables holding anything for this id, in one query. Each column is compared
 * in its own type ($1 integer, $2 text): a cast on the column would lose its
 * index, and measured on live that ran past the statement timeout.
 */
async function tablesHolding(userId: number, columns: readonly UserColumn[]): Promise<string[]> {
  if (columns.length === 0) return [];
  const probes = columns.map((c, i) => {
    const param = INTEGER_TYPES.has(c.data_type) ? '$1::int' : '$2::text';
    return `SELECT ${i} AS at WHERE EXISTS (SELECT 1 FROM ${ident(c.table_name)} WHERE ${ident(
      c.column_name,
    )} = ${param})`;
  });
  const result = await query<{ at: number }>(
    probes.join(' UNION ALL '),
    [userId, String(userId)],
    QUERY_TIMEOUT_MS,
  );
  return [...new Set(result.rows.map((r) => columns[r.at].table_name))];
}

export async function deleteEmptyAccount(userId: number): Promise<EmptyDeleteResult> {
  const exists = await query<{ id: number }>(
    `SELECT id FROM "User" WHERE id = $1 LIMIT 1`,
    [userId],
    QUERY_TIMEOUT_MS,
  );
  if (exists.rows.length === 0) return { outcome: EmptyDeleteOutcome.NotFound };
  const holding = await tablesHolding(userId, await userColumns());
  if (holding.length > 0) return { outcome: EmptyDeleteOutcome.NotEmpty, holding };
  await withTransaction(async (client) => {
    await client.query(`DELETE FROM "User" WHERE id = $1`, [userId]);
    await client.query('INSERT INTO erasure_log (user_id, rows_deleted) VALUES ($1, $2)', [
      userId,
      1,
    ]);
  });
  // eslint-disable-next-line no-console
  console.log(`[admin] empty account ${userId} deleted (nothing anywhere held it)`);
  return { outcome: EmptyDeleteOutcome.Deleted };
}
