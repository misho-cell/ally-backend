import { query } from '../db/postgres/client';
import { HandoffAuthor, postHandoff } from './handoff.service';
import { TeamTaskAuthor } from './teamTasks.service';

/**
 * Board #562 — Giorgi's D578 as a server rule; Misho, 2 October: „კი … სულ
 * გიორგის გვერდს უნდა მიაკითხო და წამოიღო დავალებები. აუცილებელი არ არის
 * რომ 3-ზე ნაკლები იყოს დარჩენილი".
 *
 * Misho's page (2) is kept topped up with work to build: whenever it holds
 * fewer than PAGE_TWO_TARGET rows still to build, the next rows come up from
 * Giorgi's page (1) — urgent first, then by author (Giorgi, Tornike, Lika,
 * Ninia, Tornike's Claude, then others), then oldest. It runs on the server,
 * so it does not depend on anybody's computer being on.
 *
 * WHAT NEVER MOVES TO PAGE 2:
 *   - a prompt task („FOR TORNIKE'S CLAUDE") — it goes to Tornike's Claude's
 *     page (3) instead, whenever one is found on page 1;
 *   - a row already built, being tested or tested;
 *   - a decision-only row (it asks somebody to decide, not to build).
 * Each move is said once in the team box, with the numbers.
 */
const QUERY_TIMEOUT_MS = 5_000;
export const PAGE_TWO_TARGET = 10;
const GIORGI_PAGE = 1;
const MISHO_PAGE = 2;
const TORNIKES_CLAUDE_PAGE = 3;
const CANDIDATE_SCAN = 200;

const AUTHOR_ORDER: readonly TeamTaskAuthor[] = [
  TeamTaskAuthor.Giorgi,
  TeamTaskAuthor.Tornike,
  TeamTaskAuthor.Lika,
  TeamTaskAuthor.Ninia,
  TeamTaskAuthor.TornikesClaude,
];

/** Giorgi's marker, in capitals as he writes it; a sentence that merely mentions the seat is not one. */
const PROMPT_TASK_RE = /FOR TORNIKE['’]?S CLAUDE/;
const DECISION_ONLY_RE =
  /^\s*(?:decide\b|product decision\b|decision for\b)|\bgiorgi decides\b|\bmisho decides\b|გადასაწყვეტი/i;

interface Candidate {
  readonly id: number;
  readonly problem: string;
  readonly task: string;
}

export function isPromptTask(row: Candidate): boolean {
  return PROMPT_TASK_RE.test(`${row.problem}\n${row.task}`);
}

export function isDecisionOnly(row: Candidate): boolean {
  return DECISION_ONLY_RE.test(row.task);
}

async function toBuildOnPage(page: number): Promise<number> {
  const result = await query<{ n: string }>(
    `SELECT COUNT(*) AS n FROM team_tasks
      WHERE page = $1 AND status = 'to_build' AND deleted_at IS NULL`,
    [page],
    QUERY_TIMEOUT_MS,
  );
  return Number(result.rows[0]?.n ?? 0);
}

/** Giorgi's page, still to build, in the order rows come up. */
async function giorgiQueue(): Promise<Candidate[]> {
  const result = await query<Candidate>(
    `SELECT id, problem, task FROM team_tasks
      WHERE page = $1 AND status = 'to_build' AND deleted_at IS NULL
      ORDER BY priority,
               COALESCE(array_position($2::text[], created_by), cardinality($2::text[]) + 1),
               created_at, id
      LIMIT ${CANDIDATE_SCAN}`,
    [GIORGI_PAGE, AUTHOR_ORDER],
    QUERY_TIMEOUT_MS,
  );
  return result.rows;
}

/** The rows to move: every prompt task to page 3, and enough builds to fill page 2. */
export function planMoves(
  queue: readonly Candidate[],
  openOnPageTwo: number,
): { readonly toMisho: number[]; readonly toTornikesClaude: number[] } {
  const room = Math.max(0, PAGE_TWO_TARGET - openOnPageTwo);
  const toTornikesClaude = queue.filter(isPromptTask).map((r) => r.id);
  const toMisho = queue
    .filter((r) => !isPromptTask(r) && !isDecisionOnly(r))
    .slice(0, room)
    .map((r) => r.id);
  return { toMisho, toTornikesClaude };
}

async function moveRows(ids: readonly number[], page: number): Promise<number[]> {
  if (ids.length === 0) return [];
  const result = await query<{ id: number }>(
    `UPDATE team_tasks SET page = $2, updated_at = NOW()
      WHERE id = ANY($1::int[]) AND page = $3 AND status = 'to_build' AND deleted_at IS NULL
      RETURNING id`,
    [ids, page, GIORGI_PAGE],
    QUERY_TIMEOUT_MS,
  );
  return result.rows.map((r) => r.id).sort((a, b) => a - b);
}

function boardLine(toMisho: readonly number[], toTornikesClaude: readonly number[]): string {
  const ids = (list: readonly number[]): string => list.map((id) => `#${id}`).join(', ');
  const parts = [
    toMisho.length > 0 ? `to Misho's page: ${ids(toMisho)}` : '',
    toTornikesClaude.length > 0 ? `to Tornike's Claude's page: ${ids(toTornikesClaude)}` : '',
  ].filter(Boolean);
  return `Board refill (#562, automatic) — moved from Giorgi's page ${parts.join('; ')}.`;
}

/** One pass. Returns what moved; posts one box line when anything did. */
export async function refillBoardOnce(): Promise<{
  toMisho: number[];
  toTornikesClaude: number[];
}> {
  const [open, queue] = await Promise.all([toBuildOnPage(MISHO_PAGE), giorgiQueue()]);
  const plan = planMoves(queue, open);
  const toTornikesClaude = await moveRows(plan.toTornikesClaude, TORNIKES_CLAUDE_PAGE);
  const toMisho = await moveRows(plan.toMisho, MISHO_PAGE);
  if (toMisho.length + toTornikesClaude.length > 0) {
    await postHandoff(HandoffAuthor.ClaudeBackend, boardLine(toMisho, toTornikesClaude), null);
  }
  return { toMisho, toTornikesClaude };
}

/** Every minute: „within a minute" is Giorgi's done-when. */
const REFILL_INTERVAL_MS = 60_000;
let refilling = false;

export function startBoardRefillCron(): void {
  setInterval(() => {
    if (refilling) return;
    refilling = true;
    void refillBoardOnce()
      .catch((err: unknown) =>
        // eslint-disable-next-line no-console
        console.error('[board-refill] pass failed:', (err as Error).message),
      )
      .finally(() => {
        refilling = false;
      });
  }, REFILL_INTERVAL_MS).unref();
  // eslint-disable-next-line no-console
  console.log('[board-refill] started (60s)');
}
