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

export const TEAM_TASK_PAGES: readonly number[] = [1, 2];
export const TEAM_TASK_PRIORITIES: readonly number[] = [1, 2, 3];

export interface TeamTask {
  readonly id: number;
  readonly created_by: TeamTaskAuthor;
  readonly problem: string;
  readonly task: string;
  readonly priority: number;
  readonly status: TeamTaskStatus;
  readonly page: number;
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

const COLUMNS = `id, created_by, problem, task, priority, status, page, created_at, updated_at`;

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
}

export async function createTeamTask(input: NewTeamTask): Promise<TeamTask> {
  const result = await query<Record<string, unknown>>(
    `INSERT INTO team_tasks (created_by, posted_by, problem, task, priority)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING ${COLUMNS}`,
    [
      input.author,
      input.postedBy,
      input.problem.trim().slice(0, MAX_TEXT_CHARS),
      input.task.trim().slice(0, MAX_TEXT_CHARS),
      input.priority ?? 2,
    ],
    QUERY_TIMEOUT_MS,
  );
  return toTask(result.rows[0]);
}

/** One page of the board, most urgent first, oldest first within a priority. */
export async function listTeamTasks(page?: number): Promise<TeamTask[]> {
  const result = await query<Record<string, unknown>>(
    `SELECT ${COLUMNS} FROM team_tasks
      WHERE ($1::smallint IS NULL OR page = $1::smallint)
        AND deleted_at IS NULL
      ORDER BY page, priority, id
      LIMIT ${MAX_TASKS_LISTED}`,
    [page ?? null],
    QUERY_TIMEOUT_MS,
  );
  return result.rows.map(toTask);
}

export interface TeamTaskChange {
  readonly status?: TeamTaskStatus;
  readonly priority?: number;
  readonly page?: number;
  readonly problem?: string;
  readonly task?: string;
}

/** The edited text as stored, or null to keep what is there. */
function editedText(text: string | undefined): string | null {
  if (text === undefined) return null;
  const trimmed = text.trim().slice(0, MAX_TEXT_CHARS);
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Changes status, priority, page or the text; null when there is no such task.
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
