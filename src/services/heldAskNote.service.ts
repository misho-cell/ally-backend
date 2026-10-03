import { query } from '../db/postgres/client';
import { whoseAsksWereThey } from './taskAsks.service';

/**
 * The tester's 1110 (34006, 34009): „ჰკითხე გიორგის…" was held by Giorgi's
 * 24-hour limit; the first reply said so, and the owner's „რატომ არ
 * გაიგზავნა?" was answered by a new run with „…from other people". The two
 * questions were this owner's own. That run sees only the earlier reply's
 * text, not the refusal that counted whose they were, so the server says it in
 * the goal's section, beside the held question itself.
 */
const QUERY_TIMEOUT_MS = 5_000;
const MAX_HELD_IN_NOTE = 5;
const WINDOW_HOURS = 24;

interface HeldRow {
  readonly to_user_id: number;
  readonly contact_name: string;
  readonly reopens_at: string;
}

async function receivedInWindow(toUserId: number): Promise<{ from_user_id: string }[]> {
  const result = await query<{ from_user_id: string }>(
    `SELECT from_user_id::text AS from_user_id FROM task_asks
      WHERE to_user_id = $1 AND created_at > NOW() - make_interval(hours => $2)
      LIMIT 20`,
    [toUserId, WINDOW_HOURS],
    QUERY_TIMEOUT_MS,
  );
  return result.rows;
}

function heldLine(row: HeldRow, whose: string): string {
  return (
    `- ${row.contact_name}-ს კითხვა შეჩერებულია ${row.reopens_at}-მდე (UTC) და მაშინ სერვერი ` +
    `თავად გაგზავნის: ბოლო 24 საათში მას ახალი კითხვები მიუვიდა — ${whose}.`
  );
}

/** The goal's held questions and whose asks filled each window; '' when none. */
export async function heldAsksNote(taskId: number, ownerId: string): Promise<string> {
  const held = await query<HeldRow>(
    `SELECT to_user_id, contact_name, reopens_at::text AS reopens_at FROM held_asks
      WHERE task_id = $1 AND released_at IS NULL
      ORDER BY created_at LIMIT $2`,
    [taskId, MAX_HELD_IN_NOTE],
    QUERY_TIMEOUT_MS,
  );
  if (held.rows.length === 0) return '';
  const lines = await Promise.all(
    held.rows.map(async (row) =>
      heldLine(row, whoseAsksWereThey(await receivedInWindow(row.to_user_id), ownerId)),
    ),
  );
  return (
    '\n\n## შეჩერებული კითხვები\n' +
    lines.join('\n') +
    '\nთუ მფლობელი იკითხავს, რატომ არ გაიგზავნა, ეს თქვი ზუსტად ასე; „სხვა ადამიანებისგან" ' +
    'მხოლოდ მაშინ, თუ აქ ასე წერია.'
  );
}
