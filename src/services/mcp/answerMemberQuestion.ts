import { query } from '../../db/postgres/client';
import { SentAnswer, sendApprovedAskAnswer } from '../taskAsks.service';

/**
 * 1256 (Tornike's customer, 5 Oct; done when the four work on a real account):
 * a user who lives in Claude must be able to answer a question from inside it.
 * check_my_inbox has listed `questions_for_me` — what another member asked
 * this user, with an ask_id — since 3367, and no connector tool took that id:
 * the question could be read and never answered. The app's answer path
 * (sendApprovedAskAnswer, D48/D648) is keyed to the incoming-ask thread; this
 * finds that thread from the ask_id, for the ask's own recipient only.
 *
 * On since Misho's yes to the tool's exact description (§136, 12 Oct 20:50 UTC).
 */
export const ANSWER_MEMBER_QUESTION_ON = true;

const QUERY_TIMEOUT_MS = 5_000;
const ASK_ID_RE = /^\d+$/u;

const NOT_CONFIRMED =
  'Not sent: confirmed must be true, and only when these words are the user’s own answer.';
const UNKNOWN_ASK =
  'Not sent: no open question with that ask_id is waiting for this user. Take ask_id from ' +
  'questions_for_me in check_my_inbox.';

export interface MemberAnswerArgs {
  readonly ask_id?: string;
  readonly answer?: string;
  readonly confirmed?: boolean;
}

/**
 * The incoming-ask thread of this ask, when the ask is addressed to this user
 * and is the latest round on its thread (sendApprovedAskAnswer answers the
 * latest round, so an older id must not reach it); null otherwise.
 */
export async function askThreadOfRecipient(userId: string, askId: number): Promise<number | null> {
  const result = await query<{ ask_thread_id: number }>(
    `SELECT ta.ask_thread_id FROM task_asks ta
      WHERE ta.id = $1 AND ta.to_user_id = $2::int AND ta.ask_thread_id IS NOT NULL
        AND ta.id = (SELECT MAX(t2.id) FROM task_asks t2 WHERE t2.ask_thread_id = ta.ask_thread_id)
      LIMIT 1`,
    [askId, userId],
    QUERY_TIMEOUT_MS,
  );
  return result.rows[0]?.ask_thread_id ?? null;
}

/** The ask id as a number; null for anything that is not one. */
export function askIdOf(raw: string | undefined): number | null {
  const trimmed = (raw ?? '').trim();
  if (!ASK_ID_RE.test(trimmed)) return null;
  const id = Number(trimmed);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

/** Sends the user's answer to the member who asked; says plainly when nothing went. */
export async function answerMemberQuestion(
  userId: string,
  args: MemberAnswerArgs,
): Promise<SentAnswer> {
  if (args.confirmed !== true) return { sent: false, error: NOT_CONFIRMED };
  const askId = askIdOf(args.ask_id);
  if (askId === null) return { sent: false, error: UNKNOWN_ASK };
  const threadId = await askThreadOfRecipient(userId, askId);
  if (threadId === null) return { sent: false, error: UNKNOWN_ASK };
  return sendApprovedAskAnswer(userId, threadId, args.answer ?? '');
}

/** The connector's payload: the send's outcome, as a plain record. */
export async function mcpAnswerMemberQuestion(
  userId: string,
  args: MemberAnswerArgs,
): Promise<Record<string, unknown>> {
  return { ...(await answerMemberQuestion(userId, args)) };
}
