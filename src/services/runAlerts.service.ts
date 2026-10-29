import { query } from '../db/postgres/client';
import { HandoffAuthor, postHandoff } from './handoff.service';

/**
 * Misho, 29 Oct, after Giorgi's thread 74052: three server walls refused one
 * another and the member was told of „a delay on our side" — and we learned of
 * it from a screenshot. The server now watches for it every few minutes and
 * tells the code session in the box, so nobody has to ask a member whether
 * something went wrong.
 *
 * Three signs, each measured on three days of live data before its threshold
 * was set (29 Oct): a run whose consent and send tools were refused three or
 * more times across two or more of them (17 runs, 3 real people); a reply that
 * apologises for a fault of ours (17 replies, 4 real people); a run that ended
 * in the failure line (about 5 a day).
 *
 * Ids and counts only, in the table and in the box: never a name, a number or
 * a member's words (D149). The thread id is enough to read the rest.
 */
export enum RunAlertKind {
  Stuck = 'stuck',
  Apology = 'apology',
  Failed = 'failed',
}

const QUERY_TIMEOUT_MS = 8_000;
/** Each pass looks back this far; a finding is stored once, so overlap is harmless. */
const LOOK_BACK_MINUTES = 20;
/**
 * Lowered from 3 the same afternoon: Giorgi's 14:03Z retry was refused twice
 * (ask, then approve) and told „it could not be sent again" — no alert. Two
 * refusals across two tools: 31 runs in three days, 7 real people.
 */
const MIN_REFUSALS = 2;
const MIN_REFUSING_TOOLS = 2;
const MAX_ALERTS_IN_ONE_POST = 10;
export const MAX_ALERTS_LISTED = 100;
/** The tools whose refusals mean the run could not do what the owner asked. */
const WALL_TOOLS: readonly string[] = [
  'ask_contact',
  'propose_task_plan',
  'grant_task_permission',
  'approve_task_plan',
  'request_introduction',
  'finish_task',
];
/** A search past its budget is a designed stop, not a fault. */
const DESIGNED_STOP_PREFIX = 'Not searched%';
/** A reply apologising for a fault of ours, in the languages Netai writes. */
const APOLOGY_PATTERN =
  // The server's own replacement line (ourSideApology.ts) is the same finding.
  'ამას ვამოწმებ და მალე მოგწერ|I am looking into this and will write to you shortly|' +
  // „it could not be sent (again)" — Giorgi's 14:03Z reply, no „on our side" in it.
  'ვერ გაიგზავნა|ვერ გავაგზავნე|could not be sent|couldn.t send|წრეზე ტრიალ|ჩვენს მხარეს|შეფერხებ|ტექნიკურ(ი|მა)? (ხარვეზ|შეცდომ|პრობლემ)|on our side|something went wrong|technical (issue|problem|error)|с нашей стороны|техническ';

export interface RunAlert {
  readonly kind: RunAlertKind;
  readonly ref: string;
  readonly user_id: number | null;
  readonly thread_id: number | null;
  readonly run_id: string | null;
  readonly detail: string;
  readonly test_seat: boolean;
}

export interface StoredRunAlert extends RunAlert {
  readonly id: number;
  readonly created_at: string;
  readonly handled_at: string | null;
}

const SEAT_SQL = `EXISTS (SELECT 1 FROM test_seats s WHERE s.user_id = x.user_id)`;

async function stuckRuns(): Promise<RunAlert[]> {
  const result = await query<RunAlert>(
    `WITH x AS (
       SELECT run_id, max(thread_id) AS thread_id, max(user_id)::int AS user_id,
              string_agg(tool || '×' || n, ', ' ORDER BY tool) AS detail,
              sum(n) AS refused, count(*) AS tools
         FROM (SELECT run_id, thread_id, user_id, tool, count(*) AS n
                 FROM tool_call_log
                WHERE created_at > NOW() - make_interval(mins => $1)
                  AND ok = false AND run_id IS NOT NULL AND tool = ANY($2::text[])
                  AND coalesce(error_text, '') NOT LIKE $3
                GROUP BY run_id, thread_id, user_id, tool) per_tool
        GROUP BY run_id)
     SELECT 'stuck' AS kind, run_id AS ref, user_id, thread_id, run_id,
            'refused: ' || detail AS detail, ${SEAT_SQL} AS test_seat
       FROM x WHERE refused >= $4 AND tools >= $5`,
    [LOOK_BACK_MINUTES, WALL_TOOLS, DESIGNED_STOP_PREFIX, MIN_REFUSALS, MIN_REFUSING_TOOLS],
    QUERY_TIMEOUT_MS,
  );
  return result.rows;
}

async function apologies(): Promise<RunAlert[]> {
  const result = await query<RunAlert>(
    `SELECT 'apology' AS kind, x.id::text AS ref, x.user_id::int AS user_id, x.thread_id,
            x.run_id, 'the reply apologises for a fault of ours' AS detail,
            ${SEAT_SQL} AS test_seat
       FROM conversations x
      WHERE x.created_at > NOW() - make_interval(mins => $1)
        AND x.role = 'assistant' AND x.kind = 'message' AND x.content ~* $2`,
    [LOOK_BACK_MINUTES, APOLOGY_PATTERN],
    QUERY_TIMEOUT_MS,
  );
  return result.rows;
}

async function failedRuns(): Promise<RunAlert[]> {
  const result = await query<RunAlert>(
    `SELECT 'failed' AS kind, x.id::text AS ref, x.user_id::int AS user_id, x.thread_id,
            x.run_id, 'the run ended in the failure line' AS detail, ${SEAT_SQL} AS test_seat
       FROM conversations x
      WHERE x.created_at > NOW() - make_interval(mins => $1) AND x.kind = 'error'`,
    [LOOK_BACK_MINUTES],
    QUERY_TIMEOUT_MS,
  );
  return result.rows;
}

/** A finding as stored, with the id the box line names it by. */
export interface NewRunAlert extends RunAlert {
  readonly id: number;
}

/** Stores the findings not stored before; returns only those. */
async function storeNew(found: readonly RunAlert[]): Promise<NewRunAlert[]> {
  const stored: NewRunAlert[] = [];
  for (const a of found) {
    const result = await query<{ id: number }>(
      `INSERT INTO run_alerts (kind, ref, user_id, thread_id, run_id, detail, test_seat)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (kind, ref) DO NOTHING RETURNING id`,
      [a.kind, a.ref, a.user_id, a.thread_id, a.run_id, a.detail, a.test_seat],
      QUERY_TIMEOUT_MS,
    );
    const row = result.rows[0];
    if (row !== undefined) stored.push({ ...a, id: row.id });
  }
  return stored;
}

/**
 * Pure: the box line for new findings, real people first. The box is shared,
 * so it names the alert, never the member's thread or account (ops, 29 Oct);
 * those are in GET /admin/run-alerts.
 */
export function alertLine(alerts: readonly NewRunAlert[]): string {
  const ordered = [...alerts].sort((a, b) => Number(a.test_seat) - Number(b.test_seat));
  const lines = ordered.slice(0, MAX_ALERTS_IN_ONE_POST).map((a) => {
    const who = a.test_seat ? 'test seat' : 'REAL PERSON';
    return `- alert ${a.id}, ${a.kind} (${who}): ${a.detail}`;
  });
  const more = ordered.length - lines.length;
  return (
    `[watch] ${alerts.length} new finding(s):\n${lines.join('\n')}` +
    (more > 0 ? `\n…and ${more} more.` : '') +
    '\nFull list: GET /admin/run-alerts'
  );
}

/** One pass: finds, stores what is new, posts one box line when anything is. */
export async function watchRunsOnce(): Promise<NewRunAlert[]> {
  const found = (await Promise.all([stuckRuns(), apologies(), failedRuns()])).flat();
  const fresh = await storeNew(found);
  if (fresh.length > 0) await postHandoff(HandoffAuthor.ClaudeBackend, alertLine(fresh), null);
  return fresh;
}

/** The open findings, newest first (or every one, handled included). */
export async function listRunAlerts(openOnly: boolean): Promise<StoredRunAlert[]> {
  const result = await query<StoredRunAlert>(
    `SELECT id, kind, ref, user_id, thread_id, run_id, detail, test_seat,
            created_at, handled_at
       FROM run_alerts WHERE ($1 = false OR handled_at IS NULL)
      ORDER BY created_at DESC LIMIT $2`,
    [openOnly, MAX_ALERTS_LISTED],
    QUERY_TIMEOUT_MS,
  );
  return result.rows;
}

/** Marks one finding handled; false when there is no such open finding. */
export async function markRunAlertHandled(id: number): Promise<boolean> {
  const result = await query(
    `UPDATE run_alerts SET handled_at = NOW() WHERE id = $1 AND handled_at IS NULL`,
    [id],
    QUERY_TIMEOUT_MS,
  );
  return (result.rowCount ?? 0) > 0;
}

const WATCH_INTERVAL_MS = 5 * 60_000;
let watching = false;

export function startRunWatchCron(): void {
  setInterval(() => {
    if (watching) return;
    watching = true;
    void watchRunsOnce()
      .catch((err: unknown) =>
        // eslint-disable-next-line no-console
        console.error('[run-watch] pass failed:', (err as Error).message),
      )
      .finally(() => {
        watching = false;
      });
  }, WATCH_INTERVAL_MS).unref();
  // eslint-disable-next-line no-console
  console.log('[run-watch] started (5 min)');
}
