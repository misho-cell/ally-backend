import { SET_DISCUSSION_TOOL_NAME } from './tools/setDiscussion';
import { query } from '../db/postgres/client';

/**
 * Board #67 (a loyal old Ally customer, 1 Oct, via Tornike): she asked Netai
 * to ask her questions and learn her business first. It told her what she
 * does, went straight to finding leads, and after „I don't need leads now, ask
 * me first" still put lead-finding into the plan.
 *
 * So the owner's word holds in code: while a conversation is in discussion no
 * goal is opened, the turn holds no tool but set_discussion (so no search, no
 * plan, no lead), and the reply is questions about them — until they ask for
 * action.
 *
 * #8779 group 4 (the founder, 4 Nov): no fixed word lists. DISCUSS_FIRST_RE and
 * ASKS_FOR_ACTION_RE read the owner's lines for it; the model now reads them
 * and calls set_discussion, and the conversation keeps the mode
 * (threads.discussion_since). The server enforces it; it never reads the words.
 */
const DISCUSSION_QUERY_TIMEOUT_MS = 5_000;

/**
 * Tester's report 8 Nov, G10: „ask me questions about my service" — the run
 * saved the answers and the server refused both saves as held tools, so „what
 * do you know about me?" found nothing. A discussion turn may save what the
 * owner says about himself; it still opens no goal, plan or search.
 */
export const DISCUSSION_TOOLS: ReadonlySet<string> = new Set([
  SET_DISCUSSION_TOOL_NAME,
  'update_user_profile',
  'save_private_context',
]);

export const DISCUSS_TURN_NOTE =
  '\n\n## This turn\nThe owner asked to discuss first and be asked questions before any ' +
  'action. This turn holds only set_discussion and the two tools that save what he tells you ' +
  'about himself (update_user_profile, save_private_context): no search, no plan, no leads, no ' +
  'list of people. Save what he answers about himself and his work. Do not tell them what their business is — not even from their saved ' +
  'profile or an earlier conversation; let them tell you. Answer what they said in a sentence ' +
  'or two, then ask one or two short questions that help you understand their business and ' +
  'what they want. When they now ask you to act, call set_discussion with discuss: false.';

/** A discussion turn writes questions, not a report; this keeps it short. */
export const DISCUSS_MAX_TOKENS = 600;

/** Whether this conversation is in discussion; a failed read is not (the turn runs as before). */
export async function threadInDiscussion(threadId: number): Promise<boolean> {
  try {
    const result = await query<{ on: boolean }>(
      `SELECT discussion_since IS NOT NULL AS on FROM threads WHERE id = $1 LIMIT 1`,
      [threadId],
      DISCUSSION_QUERY_TIMEOUT_MS,
    );
    return result.rows[0]?.on === true;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(`[discuss] thread ${threadId}: not read:`, (err as Error).message);
    return false;
  }
}

/** The model's set_discussion: the owner's own conversation only. True when it was written. */
export async function setDiscussion(
  threadId: number,
  userId: string,
  discuss: boolean,
): Promise<boolean> {
  const result = await query(
    `UPDATE threads SET discussion_since = CASE WHEN $3 THEN COALESCE(discussion_since, NOW()) END
      WHERE id = $1 AND user_id = $2::int`,
    [threadId, userId, discuss],
    DISCUSSION_QUERY_TIMEOUT_MS,
  );
  return (result.rowCount ?? 0) > 0;
}
