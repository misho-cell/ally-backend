import { query } from '../db/postgres/client';
import { geoName } from './georgianCase';
import { RunLanguage } from './runLanguage';
import { saveThreadMessage, userLanguage } from './threads.service';

/**
 * ROW 305 (a) — ONE STORY, TWO THREADS, SAID OUT LOUD.
 *
 * Goal 11323: Netai Test 65 asked Netai Test 68 about an electrician (ask
 * thread 26997), then asked the same person, for the same goal, to introduce
 * the electrician — and that request opened thread 27194 beside it, with
 * nothing saying the two were one conversation.
 *
 * A thread has one purpose, fixed when it is made: an ask thread runs the
 * answer tools, a request thread runs accept/decline. Holding both in one
 * thread is the real fix, (b), and it is Tornike's decision. Until then each
 * of the two threads says where the other is — the new one points back, the
 * old one points forward — so the person reads one story in two places.
 */

const POINTER_QUERY_TIMEOUT_MS = 3_000;

export interface EarlierAskThread {
  readonly id: number;
  readonly title: string | null;
}

export interface RequestPointerInput {
  readonly taskId: number;
  readonly requesterUserId: number;
  readonly readerUserId: number;
  readonly requestThreadId: number;
  readonly requestThreadTitle: string | null;
  readonly requesterName: string;
  readonly targetName: string;
}

/** The newest ask the same requester sent this reader for the same goal. */
export async function findEarlierAskThread(
  taskId: number,
  requesterUserId: number,
  readerUserId: number,
): Promise<EarlierAskThread | null> {
  const result = await query<{ id: number; title: string | null }>(
    `SELECT t.id, t.title
       FROM task_asks a
       JOIN threads t ON t.id = a.ask_thread_id
      WHERE a.task_id = $1 AND a.from_user_id = $2 AND a.to_user_id = $3
      ORDER BY a.created_at DESC
      LIMIT 1`,
    [taskId, requesterUserId, readerUserId],
    POINTER_QUERY_TIMEOUT_MS,
  );
  return result.rows[0] ?? null;
}

function chatName(title: string | null): string {
  return title ? ` „${title}"` : '';
}

/** Written into the NEW request thread: this continues the earlier chat. */
export function backPointerLine(
  language: RunLanguage,
  requesterName: string,
  askTitle: string | null,
): string {
  const chat = chatName(askTitle);
  switch (language) {
    case 'en':
      return `This continues your earlier conversation with **${requesterName}** about the same goal${chat}.`;
    case 'ru':
      return `Это продолжение твоего разговора с **${requesterName}** о той же цели${chat}.`;
    case 'es':
      return `Esto continúa tu conversación anterior con **${requesterName}** sobre el mismo objetivo${chat}.`;
    default:
      return `ეს **${requesterName}**-თან შენი წინა საუბრის გაგრძელებაა, იმავე საკითხზე${chat}.`;
  }
}

/** Written into the OLD ask thread: the request is waiting in its own chat. */
export function forwardPointerLine(
  language: RunLanguage,
  requesterName: string,
  targetName: string,
  requestTitle: string | null,
): string {
  const chat = chatName(requestTitle);
  switch (language) {
    case 'en':
      return `**${requesterName}** has now asked you, about this same goal, to introduce them to **${targetName}**. It is waiting for your answer in its own conversation${chat}.`;
    case 'ru':
      return `**${requesterName}** теперь просит тебя, по этой же цели, познакомить его с **${targetName}**. Запрос ждёт твоего ответа в отдельном разговоре${chat}.`;
    case 'es':
      return `**${requesterName}** te pide ahora, sobre este mismo objetivo, que le presentes a **${targetName}**. La petición espera tu respuesta en su propia conversación${chat}.`;
    default:
      return `**${requesterName}** ამავე საკითხზე ახლა გთხოვს, გააცნო **${geoName(targetName, 'dat')}**. მოთხოვნა შენს პასუხს ცალკე საუბარში ელოდება${chat}.`;
  }
}

/**
 * Both lines, when the request came out of a goal that already asked this
 * reader something. Returns whether they were written.
 */
export async function linkRequestToEarlierAsk(input: RequestPointerInput): Promise<boolean> {
  const earlier = await findEarlierAskThread(
    input.taskId,
    input.requesterUserId,
    input.readerUserId,
  );
  if (earlier === null) return false;
  const language = await userLanguage(String(input.readerUserId));
  await saveThreadMessage(
    input.requestThreadId,
    input.readerUserId,
    'assistant',
    backPointerLine(language, input.requesterName, earlier.title),
  );
  await saveThreadMessage(
    earlier.id,
    input.readerUserId,
    'assistant',
    forwardPointerLine(language, input.requesterName, input.targetName, input.requestThreadTitle),
  );
  return true;
}
