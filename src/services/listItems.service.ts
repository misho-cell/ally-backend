import { query } from '../db/postgres/client';
import { findWaysIn, WayIn, WayInOrigin } from './openingSearch.service';

/**
 * Board #893 (the founder, 4 October): a list the owner gave Netai becomes the
 * work of ONE goal. Each row gets its way in — who in the owner's own contacts
 * is tied to it — looked up in parallel, and keeps a state from then on.
 *
 * THIS SENDS NOTHING. Looking up a way in reads the owner's own contacts; who
 * is written to is still decided by one plan and its one approve card (D626),
 * and sent within the daily limits like any other ask.
 */
const LIST_QUERY_TIMEOUT_MS = 8_000;
/** How many items the model is shown by name; the counts always cover all. */
const MAX_ITEMS_SHOWN = 40;

export enum ListItemState {
  RouteFound = 'route_found',
  NoRoute = 'no_route',
  Unchecked = 'unchecked',
  Asked = 'asked',
  Answered = 'answered',
  Agreed = 'agreed',
  Refused = 'refused',
}

/** The header words that name the column a row is called by. */
const NAME_COLUMN_RE =
  /(name|company|firm|organi[sz]ation|სახელ|დასახელ|კომპანი|ორგანიზაცი|ფირმ)/iu;

/** The column a row is called by: one whose header names it, else the first. */
export function nameColumn(columns: readonly string[]): number {
  const at = columns.findIndex((c) => NAME_COLUMN_RE.test(c));
  return at === -1 ? 0 : at;
}

export function stateOf(wayIn: WayIn | undefined): ListItemState {
  if (wayIn?.kind === 'first_circle') return ListItemState.RouteFound;
  if (wayIn?.kind === 'none') return ListItemState.NoRoute;
  return ListItemState.Unchecked;
}

interface FileRows {
  readonly columns: string[];
  readonly rows: string[][];
}

/** The file, only when it belongs to this owner's conversation that holds this goal. */
async function fileForGoal(
  userId: string,
  taskId: number,
  fileId: number,
): Promise<FileRows | null> {
  const result = await query<FileRows>(
    `SELECT f.columns, f.rows
       FROM thread_files f
       JOIN tasks t ON t.thread_id = f.thread_id
      WHERE f.id = $1 AND t.id = $2 AND f.user_id = $3::int AND t.user_id = $3::int
        AND t.status = 'open'
      LIMIT 1`,
    [fileId, taskId, userId],
    LIST_QUERY_TIMEOUT_MS,
  );
  return result.rows[0] ?? null;
}

export interface ListItemLine {
  readonly row: number;
  readonly label: string;
  readonly state: ListItemState;
  readonly throughWhom: string | null;
}

export interface ListWorkStarted {
  readonly total: number;
  readonly counts: Readonly<Record<string, number>>;
  readonly items: readonly ListItemLine[];
}

export type ListWorkOutcome =
  | { readonly ok: true; readonly value: ListWorkStarted }
  | { readonly ok: false; readonly error: string };

const NOT_THIS_GOALS_FILE =
  'Not started: that file is not in this goal’s conversation, or the goal is not open. ' +
  'Use the file id from the file event in this conversation, and an open goal on it.';

/** Turn the file's rows into this goal's items, each with its way in. */
export async function startListWork(
  userId: string,
  taskId: number,
  fileId: number,
  origin: WayInOrigin = {},
): Promise<ListWorkOutcome> {
  const file = await fileForGoal(userId, taskId, fileId);
  if (file === null) return { ok: false, error: NOT_THIS_GOALS_FILE };
  const at = nameColumn(file.columns);
  const lines = file.rows
    .map((row, index) => ({ index, row, label: (row[at] ?? '').trim() }))
    .filter((line) => line.label !== '');
  const waysIn = await findWaysIn(userId, [...new Set(lines.map((l) => l.label))], origin);
  const items: ListItemLine[] = lines.map((line) => {
    const wayIn = waysIn.get(line.label);
    return {
      row: line.index + 1,
      label: line.label,
      state: stateOf(wayIn),
      throughWhom: wayIn?.kind === 'first_circle' ? wayIn.who : null,
    };
  });
  await saveItems(
    taskId,
    fileId,
    items,
    lines.map((l) => l.row),
  );
  return {
    ok: true,
    value: {
      total: items.length,
      counts: countByState(items),
      items: items.slice(0, MAX_ITEMS_SHOWN),
    },
  };
}

/** One statement for the whole list; a row already worked keeps its state. */
async function saveItems(
  taskId: number,
  fileId: number,
  items: readonly ListItemLine[],
  rows: readonly string[][],
): Promise<void> {
  if (items.length === 0) return;
  await query(
    `INSERT INTO list_items (task_id, thread_file_id, row_index, label, row_data, way_in, through_whom, state)
     SELECT $1, $2, x.row_index, x.label, x.row_data, x.way_in, x.through_whom, x.state
       FROM jsonb_to_recordset($3::jsonb)
         AS x(row_index int, label text, row_data jsonb, way_in text, through_whom text, state text)
     ON CONFLICT (task_id, thread_file_id, row_index) DO NOTHING`,
    [
      taskId,
      fileId,
      JSON.stringify(
        items.map((item, i) => ({
          row_index: item.row,
          label: item.label,
          row_data: rows[i] ?? [],
          way_in: wayInKind(item.state),
          through_whom: item.throughWhom,
          state: item.state,
        })),
      ),
    ],
    LIST_QUERY_TIMEOUT_MS,
  );
}

/** The stored way-in kind for a state the lookup set. */
function wayInKind(state: ListItemState): WayIn['kind'] {
  if (state === ListItemState.RouteFound) return 'first_circle';
  return state === ListItemState.NoRoute ? 'none' : 'unchecked';
}

export function countByState(items: readonly { state: string }[]): Record<string, number> {
  return items.reduce<Record<string, number>>((acc, item) => {
    acc[item.state] = (acc[item.state] ?? 0) + 1;
    return acc;
  }, {});
}

/** „Where are we on the list?" — the counts for every item of this goal. */
export async function listStatus(userId: string, taskId: number): Promise<Record<string, number>> {
  const result = await query<{ state: string; n: string }>(
    `SELECT li.state, COUNT(*)::text AS n
       FROM list_items li JOIN tasks t ON t.id = li.task_id
      WHERE li.task_id = $1 AND t.user_id = $2::int
      GROUP BY li.state`,
    [taskId, userId],
    LIST_QUERY_TIMEOUT_MS,
  );
  return Object.fromEntries(result.rows.map((r) => [r.state, Number(r.n)]));
}
