import { query } from '../db/postgres/client';

/**
 * M2 (plate v288; Misho, 1 October): the team's task board, where every row
 * says who created it. The author is decided by the SERVER from the login —
 * a person signed in as themselves (M1) cannot file a task under another
 * name. Only the shared login, which AI seats write through, names an author,
 * and then only from the fixed list.
 */
const QUERY_TIMEOUT_MS = 5_000;
const MAX_TASKS_LISTED = 500;
const MAX_TEXT_CHARS = 4_000;
/** Tornike's own login (the founder's account, D177). */
const TORNIKE_ACCOUNT_ID = '501';

export enum TeamTaskAuthor {
  Tornike = 'tornike',
  Giorgi = 'giorgi',
  Lika = 'lika',
  Ninia = 'ninia',
  Misho = 'misho',
  Ai = 'ai',
  /** The tester's 977 (D558): each Claude seat is its own author. */
  TornikesClaude = 'tornikes_claude',
  GiorgisClaude = 'giorgis_claude',
}

export enum TeamTaskStatus {
  ToBuild = 'to_build',
  Built = 'built',
  BeingTested = 'being_tested',
  Tested = 'tested',
}

/** #463: 1 = waiting for Giorgi, 2 = with Misho, 3 = with Tornike's Claude (prompt work). */
export const TEAM_TASK_PAGES: readonly number[] = [1, 2, 3];
export const TEAM_TASK_PRIORITIES: readonly number[] = [1, 2, 3];

/**
 * Board #5809 (the founder's D828): whose next move a row waits on — a stored
 * field, not a guess from the status (migration 252). Rows from before it are
 * NULL until the tester fills them.
 */
export enum TeamTaskTurn {
  Misho = 'misho',
  MishosClaude = 'mishos_claude',
  Giorgi = 'giorgi',
  Lika = 'lika',
  Ninia = 'ninia',
  Tornike = 'tornike',
  Tester = 'tester',
}

export const TEAM_TASK_TURNS: readonly TeamTaskTurn[] = Object.values(TeamTaskTurn);
/** The filter value, and the counts key, for a row whose turn is not set yet. */
export const WHOSE_TURN_UNSET = 'unset' as const;
export type TeamTaskTurnFilter = TeamTaskTurn | typeof WHOSE_TURN_UNSET;

const TURN_LIST = TEAM_TASK_TURNS.join(', ');
export const WHOSE_TURN_INVALID = `whose_turn is one of ${TURN_LIST}`;
export const WHOSE_TURN_NEEDED_ON_CREATE = `whose_turn is needed on a new task: one of ${TURN_LIST}`;
export const WHOSE_TURN_NEEDED_WITH_STATUS = `whose_turn is needed whenever status changes: one of ${TURN_LIST}`;
export const WHOSE_TURN_FILTER_INVALID = `whose_turn filters by one of ${TURN_LIST}, or ${WHOSE_TURN_UNSET}`;

export interface TeamTask {
  readonly id: number;
  readonly created_by: TeamTaskAuthor;
  readonly problem: string;
  readonly task: string;
  readonly priority: number;
  readonly status: TeamTaskStatus;
  readonly page: number;
  readonly whose_turn: TeamTaskTurn | null;
  readonly created_at: string;
  readonly updated_at: string;
}

/** Staff accounts' team names (§81) → the author they file as. */
const STAFF_NAME_AUTHOR: Readonly<Record<string, TeamTaskAuthor>> = {
  gio: TeamTaskAuthor.Giorgi,
  giorgi: TeamTaskAuthor.Giorgi,
  lika: TeamTaskAuthor.Lika,
  ninia: TeamTaskAuthor.Ninia,
  misho: TeamTaskAuthor.Misho,
};

export function isTeamTaskAuthor(value: unknown): value is TeamTaskAuthor {
  return Object.values(TeamTaskAuthor).includes(value as TeamTaskAuthor);
}

export function isTeamTaskStatus(value: unknown): value is TeamTaskStatus {
  return Object.values(TeamTaskStatus).includes(value as TeamTaskStatus);
}

export function isTeamTaskTurn(value: unknown): value is TeamTaskTurn {
  return TEAM_TASK_TURNS.includes(value as TeamTaskTurn);
}

export function isTeamTaskTurnFilter(value: unknown): value is TeamTaskTurnFilter {
  return value === WHOSE_TURN_UNSET || isTeamTaskTurn(value);
}

/** Why a new task's whose_turn is refused, or null when it is one of the seats. */
export function createTurnRefusal(value: unknown): string | null {
  if (value === undefined) return WHOSE_TURN_NEEDED_ON_CREATE;
  return isTeamTaskTurn(value) ? null : WHOSE_TURN_INVALID;
}

/**
 * Why a change's whose_turn is refused, or null. A change that carries a status
 * must say whose move it is next; any other change may set it or leave it.
 */
export function changeTurnRefusal(value: unknown, changesStatus: boolean): string | null {
  if (value === undefined) return changesStatus ? WHOSE_TURN_NEEDED_WITH_STATUS : null;
  return isTeamTaskTurn(value) ? null : WHOSE_TURN_INVALID;
}

/** Who a login files tasks as, or null when it is the shared login. */
export async function authorForLogin(userId: string): Promise<TeamTaskAuthor | null> {
  if (userId === TORNIKE_ACCOUNT_ID) return TeamTaskAuthor.Tornike;
  const staff = await query<{ name: string }>(
    `SELECT name FROM staff_accounts WHERE user_id::text = $1 LIMIT 1`,
    [userId],
    QUERY_TIMEOUT_MS,
  );
  const name = staff.rows[0]?.name.trim().toLowerCase();
  return name === undefined ? null : (STAFF_NAME_AUTHOR[name] ?? null);
}

const COLUMNS = `id, created_by, problem, task, priority, status, page, whose_turn, created_at, updated_at`;

function toTask(row: Record<string, unknown>): TeamTask {
  return {
    ...(row as unknown as TeamTask),
    created_at: new Date(String(row.created_at)).toISOString(),
    updated_at: new Date(String(row.updated_at)).toISOString(),
  };
}

export interface NewTeamTask {
  readonly author: TeamTaskAuthor;
  readonly postedBy: string;
  readonly problem: string;
  readonly task: string;
  readonly priority?: number;
  readonly whoseTurn: TeamTaskTurn;
}

export async function createTeamTask(input: NewTeamTask): Promise<TeamTask> {
  const result = await query<Record<string, unknown>>(
    `INSERT INTO team_tasks (created_by, posted_by, problem, task, priority, whose_turn)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING ${COLUMNS}`,
    [
      input.author,
      input.postedBy,
      input.problem.trim().slice(0, MAX_TEXT_CHARS),
      input.task.trim().slice(0, MAX_TEXT_CHARS),
      input.priority ?? 2,
      input.whoseTurn,
    ],
    QUERY_TIMEOUT_MS,
  );
  return toTask(result.rows[0]);
}

/**
 * #266 (Giorgi, 2 October): who filed the row — Giorgi first, then Tornike,
 * Lika, Ninia, Tornike's Claude, then any other author. Since #5083 (Giorgi,
 * 15 Oct) it comes after the priority, never before it.
 */
const AUTHOR_ORDER: readonly TeamTaskAuthor[] = [
  TeamTaskAuthor.Giorgi,
  TeamTaskAuthor.Tornike,
  TeamTaskAuthor.Lika,
  TeamTaskAuthor.Ninia,
  TeamTaskAuthor.TornikesClaude,
];

/**
 * 4885 (Giorgi, 13 Oct): status comes first — what is still to build at the
 * top, what is tested at the bottom; #266's order holds inside each status.
 */
export const STATUS_ORDER: readonly TeamTaskStatus[] = [
  TeamTaskStatus.ToBuild,
  TeamTaskStatus.Built,
  TeamTaskStatus.BeingTested,
  TeamTaskStatus.Tested,
];

/** The stored whose_turn a filter matches: a seat, or NULL for „unset". */
function turnMatched(filter: TeamTaskTurnFilter): TeamTaskTurn | null {
  return filter === WHOSE_TURN_UNSET ? null : filter;
}

/**
 * One page of the board: by status (4885), then urgent first (#5083, Giorgi,
 * 15 Oct: „urgent always first, then authors"), then by author (#266), newest
 * first as the last tie-break. Priority 1 is urgent. #5809: optionally only
 * the rows waiting on one seat, or only those whose turn is not set.
 */
export async function listTeamTasks(
  page?: number,
  whoseTurn?: TeamTaskTurnFilter,
): Promise<TeamTask[]> {
  const result = await query<Record<string, unknown>>(
    `SELECT ${COLUMNS} FROM team_tasks
      WHERE ($1::smallint IS NULL OR page = $1::smallint)
        AND (NOT $4::boolean OR whose_turn IS NOT DISTINCT FROM $5::text)
        AND deleted_at IS NULL
      ORDER BY page,
               COALESCE(array_position($3::text[], status), cardinality($3::text[]) + 1),
               priority,
               COALESCE(array_position($2::text[], created_by), cardinality($2::text[]) + 1),
               id DESC
      LIMIT ${MAX_TASKS_LISTED}`,
    [
      page ?? null,
      AUTHOR_ORDER,
      STATUS_ORDER,
      whoseTurn !== undefined,
      whoseTurn === undefined ? null : turnMatched(whoseTurn),
    ],
    QUERY_TIMEOUT_MS,
  );
  return result.rows.map(toTask);
}

export type WhoseTurnCounts = Readonly<Record<TeamTaskTurnFilter, number>>;

/** By status, plus (#5809) `whose_turn`: by seat, and `unset` for rows not filled yet. */
export interface TeamTaskCounts extends Readonly<Record<TeamTaskStatus, number>> {
  readonly whose_turn: WhoseTurnCounts;
}

function zeroStatusCounts(): Record<TeamTaskStatus, number> {
  return {
    [TeamTaskStatus.ToBuild]: 0,
    [TeamTaskStatus.Built]: 0,
    [TeamTaskStatus.BeingTested]: 0,
    [TeamTaskStatus.Tested]: 0,
  };
}

function zeroTurnCounts(): Record<TeamTaskTurnFilter, number> {
  return {
    [TeamTaskTurn.Misho]: 0,
    [TeamTaskTurn.MishosClaude]: 0,
    [TeamTaskTurn.Giorgi]: 0,
    [TeamTaskTurn.Lika]: 0,
    [TeamTaskTurn.Ninia]: 0,
    [TeamTaskTurn.Tornike]: 0,
    [TeamTaskTurn.Tester]: 0,
    [WHOSE_TURN_UNSET]: 0,
  };
}

/** The counts key a row's stored whose_turn falls under, or null when it is unknown. */
function turnKey(value: unknown): TeamTaskTurnFilter | null {
  if (value === null || value === undefined) return WHOSE_TURN_UNSET;
  return isTeamTaskTurn(value) ? value : null;
}

/**
 * The counts from the database rows (one per status × whose_turn), every key
 * present (0 when none). The status counts are of the rows the list shows, so
 * they follow the whose_turn filter; the whose_turn counts are of the whole tab,
 * so each seat's number is there to pick before filtering by it.
 */
export function countsFrom(
  rows: readonly Record<string, unknown>[],
  whoseTurn?: TeamTaskTurnFilter,
): TeamTaskCounts {
  const byStatus = zeroStatusCounts();
  const byTurn = zeroTurnCounts();
  for (const row of rows) {
    const n = Number(row.n);
    const turn = turnKey(row.whose_turn);
    if (turn !== null) byTurn[turn] += n;
    const listed = whoseTurn === undefined || turn === whoseTurn;
    if (listed && isTeamTaskStatus(row.status)) byStatus[row.status] += n;
  }
  return { ...byStatus, whose_turn: byTurn };
}

/**
 * 4885: the line above the tab — how many rows of each status it holds. Counted
 * in the database, so a tab longer than the listing limit still counts right.
 * At most one row per status × whose_turn comes back.
 */
export async function countTeamTasks(
  page?: number,
  whoseTurn?: TeamTaskTurnFilter,
): Promise<TeamTaskCounts> {
  const result = await query<Record<string, unknown>>(
    `SELECT status, whose_turn, COUNT(*)::int AS n FROM team_tasks
      WHERE ($1::smallint IS NULL OR page = $1::smallint)
        AND deleted_at IS NULL
      GROUP BY status, whose_turn`,
    [page ?? null],
    QUERY_TIMEOUT_MS,
  );
  return countsFrom(result.rows, whoseTurn);
}

export interface TeamTaskChange {
  readonly status?: TeamTaskStatus;
  readonly priority?: number;
  readonly page?: number;
  readonly problem?: string;
  readonly task?: string;
  readonly whoseTurn?: TeamTaskTurn;
}

/** The edited text as stored, or null to keep what is there. */
function editedText(text: string | undefined): string | null {
  if (text === undefined) return null;
  const trimmed = text.trim().slice(0, MAX_TEXT_CHARS);
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Changes status, priority, page, the text or whose turn it is; null when there
 * is no such task. Whose turn cannot be set back to unset.
 *
 * Giorgi's Claude, 2 October (G-001): a PATCH carrying new problem/task text
 * answered 200 and changed nothing, because the text was never read. It is now;
 * an empty text keeps what is there rather than blanking a row.
 */
export async function updateTeamTask(id: number, change: TeamTaskChange): Promise<TeamTask | null> {
  const result = await query<Record<string, unknown>>(
    `UPDATE team_tasks
        SET status = COALESCE($2, status),
            priority = COALESCE($3::smallint, priority),
            page = COALESCE($4::smallint, page),
            problem = COALESCE($5, problem),
            task = COALESCE($6, task),
            whose_turn = COALESCE($7, whose_turn),
            updated_at = NOW()
      WHERE id = $1 AND deleted_at IS NULL
      RETURNING ${COLUMNS}`,
    [
      id,
      change.status ?? null,
      change.priority ?? null,
      change.page ?? null,
      editedText(change.problem),
      editedText(change.task),
      change.whoseTurn ?? null,
    ],
    QUERY_TIMEOUT_MS,
  );
  return result.rows[0] ? toTask(result.rows[0]) : null;
}

/**
 * Takes a row off the board; false when there is no such row on it. The row is
 * hidden, not erased: who removed it and when stay with it, and it can be put
 * back (migration 196).
 */
export async function deleteTeamTask(id: number, deletedBy: string): Promise<boolean> {
  const result = await query(
    `UPDATE team_tasks SET deleted_at = NOW(), deleted_by = $2
      WHERE id = $1 AND deleted_at IS NULL`,
    [id, deletedBy],
    QUERY_TIMEOUT_MS,
  );
  return (result.rowCount ?? 0) > 0;
}
