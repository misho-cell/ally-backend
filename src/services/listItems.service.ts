import ExcelJS from 'exceljs';
import { query } from '../db/postgres/client';
import { RunLanguage } from './runLanguage';
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

export interface ListStatus {
  /** Every row of the goal's list, by state. */
  readonly rows: Readonly<Record<string, number>>;
  /** The goal's asks by status — the people the plan wrote to and what came back. */
  readonly asks: Readonly<Record<string, number>>;
}

/** „Where are we on the list?" — the rows by state, and the goal's asks by status. */
export async function listStatus(userId: string, taskId: number): Promise<ListStatus> {
  const [rows, asks] = await Promise.all([
    query<{ state: string; n: string }>(
      `SELECT li.state, COUNT(*)::text AS n
         FROM list_items li JOIN tasks t ON t.id = li.task_id
        WHERE li.task_id = $1 AND t.user_id = $2::int
        GROUP BY li.state`,
      [taskId, userId],
      LIST_QUERY_TIMEOUT_MS,
    ),
    query<{ state: string; n: string }>(
      `SELECT a.status AS state, COUNT(*)::text AS n
         FROM task_asks a JOIN tasks t ON t.id = a.task_id
        WHERE a.task_id = $1 AND t.user_id = $2::int AND a.parent_ask_id IS NULL
        GROUP BY a.status`,
      [taskId, userId],
      LIST_QUERY_TIMEOUT_MS,
    ),
  ]);
  const byState = (r: { rows: { state: string; n: string }[] }): Record<string, number> =>
    Object.fromEntries(r.rows.map((x) => [x.state, Number(x.n)]));
  return { rows: byState(rows), asks: byState(asks) };
}

/**
 * Board #894 (the founder, 4 October): „files must also come OUT of Netai." The
 * worked list goes back as Excel — the owner's own columns, then Netai's: the
 * way in, through whom, and where the row stands.
 */
const STATE_WORDS: Readonly<Record<RunLanguage, Readonly<Record<string, string>>>> = {
  ka: {
    route_found: 'გზა ნაპოვნია',
    no_route: 'გზა არ არის',
    unchecked: 'არ შემოწმდა',
    asked: 'ვკითხე',
    answered: 'უპასუხა',
    agreed: 'დათანხმდა',
    refused: 'უარი თქვა',
  },
  en: {
    route_found: 'route found',
    no_route: 'no route',
    unchecked: 'not checked',
    asked: 'asked',
    answered: 'answered',
    agreed: 'agreed',
    refused: 'refused',
  },
  ru: {
    route_found: 'путь найден',
    no_route: 'пути нет',
    unchecked: 'не проверено',
    asked: 'спросил',
    answered: 'ответил',
    agreed: 'согласился',
    refused: 'отказал',
  },
  es: {
    route_found: 'camino encontrado',
    no_route: 'sin camino',
    unchecked: 'sin comprobar',
    asked: 'preguntado',
    answered: 'respondió',
    agreed: 'aceptó',
    refused: 'rechazó',
  },
};

/** Every list a goal can carry, many files of up to 500 rows each. */
const MAX_ROWS_EXPORTED = 5_000;

const WAY_IN_WORDS: Readonly<Record<RunLanguage, Readonly<Record<string, string>>>> = {
  ka: {
    first_circle: 'შენი კონტაქტის გავლით',
    none: 'შენს კონტაქტებში არავინ',
    unchecked: 'არ შემოწმდა',
  },
  en: {
    first_circle: 'through your contact',
    none: 'nobody in your contacts',
    unchecked: 'not checked',
  },
  ru: { first_circle: 'через твой контакт', none: 'никого в контактах', unchecked: 'не проверено' },
  es: {
    first_circle: 'a través de tu contacto',
    none: 'nadie en tus contactos',
    unchecked: 'sin comprobar',
  },
};

const NETAI_COLUMNS: Readonly<Record<RunLanguage, readonly string[]>> = {
  ka: ['Netai: გზა', 'Netai: ვისი გავლით', 'Netai: მდგომარეობა'],
  en: ['Netai: way in', 'Netai: through whom', 'Netai: where it stands'],
  ru: ['Netai: путь', 'Netai: через кого', 'Netai: состояние'],
  es: ['Netai: camino', 'Netai: a través de', 'Netai: estado'],
};

interface WorkedRow {
  readonly row_data: string[];
  readonly way_in: string;
  readonly through_whom: string | null;
  readonly state: string;
  readonly columns: string[];
}

/** The goal's worked list as an .xlsx file; null when the goal has no list of this owner's. */
export async function listWorkbook(
  userId: string,
  taskId: number,
  language: RunLanguage,
): Promise<Buffer | null> {
  const result = await query<WorkedRow>(
    `SELECT li.row_data, li.way_in, li.through_whom, li.state, f.columns
       FROM list_items li
       JOIN tasks t ON t.id = li.task_id
       JOIN thread_files f ON f.id = li.thread_file_id
      WHERE li.task_id = $1 AND t.user_id = $2::int
      ORDER BY li.thread_file_id, li.row_index
      LIMIT $3::int`,
    [taskId, userId, MAX_ROWS_EXPORTED],
    LIST_QUERY_TIMEOUT_MS,
  );
  if (result.rows.length === 0) return null;
  const words = STATE_WORDS[language] ?? STATE_WORDS.ka;
  const book = new ExcelJS.Workbook();
  const sheet = book.addWorksheet('Netai');
  sheet.addRow([...result.rows[0].columns, ...(NETAI_COLUMNS[language] ?? NETAI_COLUMNS.ka)]);
  const ways = WAY_IN_WORDS[language] ?? WAY_IN_WORDS.ka;
  for (const r of result.rows) {
    sheet.addRow([
      ...r.row_data,
      ways[r.way_in] ?? r.way_in,
      r.through_whom ?? '',
      words[r.state] ?? r.state,
    ]);
  }
  return Buffer.from(await book.xlsx.writeBuffer());
}
