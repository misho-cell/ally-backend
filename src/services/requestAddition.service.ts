import { randomUUID } from 'crypto';
import { query } from '../db/postgres/client';
import { sendPushNotification } from './notification.service';
import { isQuietHour } from './pushQuietHours';
import { RunLanguage } from './runLanguage';
import { emitMessageAppended } from './sse.service';
import { saveServerLine, userLanguage } from './threads.service';

/**
 * Giorgi, 9 Nov: he asked a go-between something, and before the answer came
 * wanted to add a detail — „მოთხოვნა უკვე გაგზავნილია", and the detail never
 * went. In the owner's own turn, what he adds to a request still waiting goes
 * into that request's own thread, as an addition; it is not a second request.
 */
const QUERY_TIMEOUT_MS = 5_000;
const DAY_ZONE = 'Asia/Tbilisi';
export const REQUEST_ADDITION_EVENT = 'request_addition';

const ADDITION_LABEL: Readonly<Record<RunLanguage, string>> = {
  ka: 'დაზუსტება ამ მოთხოვნაზე:',
  en: 'An addition to this request:',
  ru: 'Уточнение к этой просьбе:',
  es: 'Una precisión sobre esta solicitud:',
};

export enum AdditionOutcome {
  Added = 'added',
  SameAsBefore = 'same_as_before',
  NoThread = 'no_thread',
}

interface PendingRequestRow {
  readonly mediator_user_id: number;
  readonly mediator_thread_id: number | null;
  readonly message: string | null;
}

/** The words as compared: case, spaces and punctuation do not make a new addition. */
function sameWords(a: string, b: string): boolean {
  const key = (s: string): string =>
    s
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, ' ')
      .trim();
  return key(a) === key(b);
}

/** The line the go-between reads, in their language. */
export function additionLine(language: RunLanguage, addition: string): string {
  return `${ADDITION_LABEL[language] ?? ADDITION_LABEL.ka} ${addition.trim()}`;
}

/** Adds the owner's words to a request still waiting; never sends the request again. */
export async function addToWaitingRequest(
  requestId: number,
  addition: string,
): Promise<AdditionOutcome> {
  const result = await query<PendingRequestRow>(
    // The request's own thread on the go-between's side: the one it continues,
    // or the thread it opened (most requests open their own).
    `SELECT ir.mediator_user_id, ir.message,
            COALESCE(ir.mediator_thread_id,
                     (SELECT t.id FROM threads t
                       WHERE t.introduction_request_id = ir.id
                         AND t.user_id = ir.mediator_user_id
                       ORDER BY t.id LIMIT 1)) AS mediator_thread_id
       FROM introduction_requests ir WHERE ir.id = $1 AND ir.status = 'pending' LIMIT 1`,
    [requestId],
    QUERY_TIMEOUT_MS,
  );
  const row = result.rows[0];
  if (row === undefined || row.mediator_thread_id === null) return AdditionOutcome.NoThread;
  if (row.message !== null && sameWords(row.message, addition)) {
    return AdditionOutcome.SameAsBefore;
  }
  const reader = String(row.mediator_user_id);
  const language = await userLanguage(reader).catch(() => 'ka' as RunLanguage);
  const saved = await saveServerLine(
    row.mediator_thread_id,
    row.mediator_user_id,
    additionLine(language, addition),
  );
  emitMessageAppended(reader, row.mediator_thread_id, randomUUID(), {
    messageId: String(saved.id),
    kind: 'pending',
    content: saved.content,
    choices: [],
    ref: { kind: REQUEST_ADDITION_EVENT },
    createdAt: saved.createdAt,
  });
  if (!isQuietHour(new Date(), DAY_ZONE)) {
    void sendPushNotification(reader, {
      title: 'Netai',
      body: saved.content,
      url: `/chat/${row.mediator_thread_id}`,
    }).catch(() => undefined);
  }
  return AdditionOutcome.Added;
}
