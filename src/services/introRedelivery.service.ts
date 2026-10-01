import { query } from '../db/postgres/client';
import {
  deliverAcceptOutcome,
  IntroChannel,
  outcomeMessage,
  RequestRow,
} from './introduction.service';
import { sendPushNotification } from './notification.service';
import { introAnsweredPush } from './introOpening';
import { RunLanguage } from './runLanguage';
import { getThreadsByIntroRequestId, saveThreadMessage, userLanguage } from './threads.service';
import { isMediatorSide, isRequesterSide } from './requestThreadSide';

/**
 * ROW 316 — AN ACCEPTED INTRODUCTION THAT NOBODY WAS TOLD ABOUT CORRECTLY.
 *
 * Request 1981, 29 September: the mediator accepted Giorgi's request and chose
 * „direct". The stale-row bug (fixed in 374f97c) then told all three people
 * something untrue: the mediator that his own contact was not in his
 * phonebook, Giorgi that the mediator had chosen to stay in the middle, and
 * the lawyer — a Netai member — nothing at all. New introductions are right
 * since the fix; this one was already sent wrong.
 *
 * So the delivery runs once more, from the row as it stands, through the SAME
 * function a live accept uses — no second copy of the wording that could drift
 * from it. Each of the two people who were told the wrong thing gets the right
 * sentence under a one-word „correction" label, because a second message that
 * contradicts the first without saying so is its own confusion.
 *
 * Founder's word, 30 September („5 — კი"), registered as §69 first (D44).
 */

const REDELIVERY_TIMEOUT_MS = 5_000;

const CORRECTION: Readonly<Record<RunLanguage, string>> = {
  en: 'Correction',
  ru: 'Исправление',
  es: 'Corrección',
  ka: 'შესწორება',
};

interface RedeliveryRow extends RequestRow {
  intro_channel: IntroChannel | null;
}

export interface RedeliveryPreview {
  readonly request_id: number;
  readonly status: string;
  readonly channel: IntroChannel;
  readonly has_number: boolean;
  readonly target_is_member: boolean;
  readonly threads: readonly { id: number; type: string }[];
}

export type RedeliveryRefusal = 'not_found' | 'not_accepted' | 'no_mediator';

export interface RedeliveryResult {
  /** deliverAcceptOutcome writes the member's thread itself and logs its own failure. */
  readonly target_is_member: boolean;
  readonly requester_corrected: boolean;
  readonly mediator_corrected: boolean;
}

async function loadAcceptedRequest(requestId: number): Promise<RedeliveryRow | null> {
  const result = await query<RedeliveryRow>(
    `SELECT id, request_ref, requester_user_id, mediator_user_id, target_name, target_user_id,
            target_phone, message, status, requester_task_id, origin_thread_id, intro_channel
       FROM introduction_requests
      WHERE id = $1
      LIMIT 1`,
    [requestId],
    REDELIVERY_TIMEOUT_MS,
  );
  return result.rows[0] ?? null;
}

async function targetIsMember(row: RedeliveryRow): Promise<boolean> {
  if (row.target_user_id !== null) return true;
  if (row.target_phone === null) return false;
  const member = await query<{ one: number }>(
    `SELECT 1 AS one FROM "UserPhone"
      WHERE regexp_replace(phone, '\\D', '', 'g') = regexp_replace($1, '\\D', '', 'g')
      LIMIT 1`,
    [row.target_phone],
    REDELIVERY_TIMEOUT_MS,
  );
  return member.rows.length > 0;
}

/** Why this request cannot be re-delivered, or null when it can. */
function refusalFor(row: RedeliveryRow | null): RedeliveryRefusal | null {
  if (row === null) return 'not_found';
  if (row.status !== 'accepted') return 'not_accepted';
  if (row.mediator_user_id === null) return 'no_mediator';
  return null;
}

/** What a re-delivery would do, touching nothing. No number is ever returned. */
export async function previewRedelivery(
  requestId: number,
): Promise<RedeliveryPreview | RedeliveryRefusal> {
  const row = await loadAcceptedRequest(requestId);
  const refusal = refusalFor(row);
  if (refusal !== null || row === null) return refusal ?? 'not_found';
  const threads = await getThreadsByIntroRequestId(row.id);
  return {
    request_id: row.id,
    status: row.status,
    channel: row.intro_channel ?? 'direct',
    has_number: row.target_phone !== null,
    target_is_member: await targetIsMember(row),
    threads: threads.map((thread) => ({ id: thread.id, type: thread.type })),
  };
}

async function correctionLabel(userId: number): Promise<string> {
  const language = await userLanguage(String(userId));
  return `**${CORRECTION[language]}:** `;
}

/** Runs the accept's delivery once more and corrects both earlier lines. */
export async function redeliverAcceptedIntroduction(
  requestId: number,
): Promise<RedeliveryResult | RedeliveryRefusal> {
  const row = await loadAcceptedRequest(requestId);
  const refusal = refusalFor(row);
  if (refusal !== null || row === null) return refusal ?? 'not_found';

  const mediator = await query<{ name: string | null }>(
    'SELECT name FROM "User" WHERE id = $1 LIMIT 1',
    [row.mediator_user_id],
    REDELIVERY_TIMEOUT_MS,
  );
  const mediatorName = mediator.rows[0]?.name?.trim() || 'შუამავალმა';
  const outcome = await deliverAcceptOutcome(row, mediatorName, row.intro_channel ?? 'direct');

  let requesterCorrected = false;
  let mediatorCorrected = false;
  // By SIDE, not by type: row 305 (b)'s request lives in an ask thread and a
  // goal thread, and the correction belongs wherever the wrong line was written.
  for (const thread of await getThreadsByIntroRequestId(row.id)) {
    const label = await correctionLabel(thread.user_id);
    if (isRequesterSide(thread)) {
      const line = (await outcomeMessage(row, 'accept')) + outcome.requesterExtra;
      await saveThreadMessage(thread.id, thread.user_id, 'assistant', label + line);
      requesterCorrected = true;
    } else if (isMediatorSide(thread)) {
      await saveThreadMessage(
        thread.id,
        thread.user_id,
        'assistant',
        label + outcome.mediatorFollowUp,
      );
      mediatorCorrected = true;
    }
  }
  if (requesterCorrected) {
    const language = await userLanguage(String(row.requester_user_id));
    await sendPushNotification(String(row.requester_user_id), {
      ...introAnsweredPush(language, row.target_name, true),
      url: '/chat',
    });
  }
  return {
    target_is_member: await targetIsMember(row),
    requester_corrected: requesterCorrected,
    mediator_corrected: mediatorCorrected,
  };
}
