import { query } from '../db/postgres/client';
import { askChoices } from './askOpening';
import {
  askedForThemLine,
  askerLine,
  declinedLine,
  notOnNetaiLine,
  ReferralTap,
  relayedQuestion,
} from './askReferral.service';
import { RunLanguage } from './runLanguage';
import { ASKED_AS_THE_ASKER_SAVED_THEM, ASKER_AS_THE_READER_SAVED_THEM } from './savedNameSql';
import { createRelayAsk, sendApprovedAskAnswer } from './taskAsks.service';
import { saveThreadMessage, userLanguage } from './threads.service';

/**
 * 1696 (A13): the reader tapped the referral card. „Yes" asks the person he
 * named, from his side, as a relay — her answer reaches the asker the way
 * relayed answers already do, naming him only when he allowed it. „No" tells
 * the asker he could not help. A person who is not on Netai is never written
 * to: he is offered to invite her himself.
 */
const QUERY_TIMEOUT_MS = 5_000;
const NOT_ON_NETAI_REASONS: ReadonlySet<string> = new Set([
  'recipient_not_member',
  'recipient_not_on_netai',
]);

interface OfferedReferral {
  readonly id: number;
  readonly referral_phone: string;
  readonly referral_name: string;
  readonly from_user_id: number;
  readonly question: string;
  readonly asker_name: string | null;
  readonly reader_name: string | null;
  readonly task_thread_id: number | null;
}

/** The referral this reader was offered on this conversation and has not decided yet. */
async function offeredReferral(
  recipientId: string,
  threadId: number,
): Promise<OfferedReferral | null> {
  const result = await query<OfferedReferral>(
    `SELECT ta.id, ta.referral_phone, ta.referral_name, ta.from_user_id,
            COALESCE(ta.shown_question, ta.question) AS question,
            ${ASKER_AS_THE_READER_SAVED_THEM} AS asker_name,
            ${ASKED_AS_THE_ASKER_SAVED_THEM} AS reader_name,
            (SELECT t.thread_id FROM tasks t WHERE t.id = ta.task_id) AS task_thread_id
       FROM task_asks ta
      WHERE ta.ask_thread_id = $1 AND ta.to_user_id = $2::int AND ta.status = 'sent'
        AND ta.referral_offered_at IS NOT NULL AND ta.referral_approved IS NULL
        AND ta.referral_phone IS NOT NULL
      ORDER BY ta.id DESC LIMIT 1`,
    [threadId, recipientId],
    QUERY_TIMEOUT_MS,
  );
  return result.rows[0] ?? null;
}

async function recordDecision(askId: number, approved: boolean, mayName: boolean): Promise<void> {
  await query(
    `UPDATE task_asks
        SET referral_approved = $2, may_name_referrer = $3,
            referral_to_user_id = CASE WHEN $2 THEN (
              SELECT up."userId" FROM "UserPhone" up
               WHERE regexp_replace(up.phone, '\\D', '', 'g') = regexp_replace(referral_phone, '\\D', '', 'g')
               LIMIT 1) END
      WHERE id = $1`,
    [askId, approved, mayName],
    QUERY_TIMEOUT_MS,
  );
}

/** One line in the asker's goal: the question went one step further. */
async function tellTheAsker(offer: OfferedReferral, mayName: boolean): Promise<void> {
  if (offer.task_thread_id === null) return;
  try {
    const language = await userLanguage(String(offer.from_user_id));
    const reader = mayName ? offer.reader_name?.trim() || null : null;
    await saveThreadMessage(
      offer.task_thread_id,
      offer.from_user_id,
      'assistant',
      askerLine(language, reader),
    );
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[referral] could not tell the asker:', (err as Error).message);
  }
}

async function askTheReferral(
  recipientId: string,
  offer: OfferedReferral,
  tap: ReferralTap,
  language: RunLanguage,
): Promise<string | null> {
  const asker = offer.asker_name?.trim() ?? '';
  const outcome = await createRelayAsk(
    recipientId,
    offer.id,
    offer.referral_phone,
    relayedQuestion(language, asker, offer.question),
  );
  if (!outcome.sent) {
    if (outcome.reason !== undefined && NOT_ON_NETAI_REASONS.has(outcome.reason)) {
      return notOnNetaiLine(language, offer.referral_name);
    }
    // eslint-disable-next-line no-console
    console.warn(`[referral] ask ${offer.id}: the relay was refused (${outcome.reason ?? '?'})`);
    return null;
  }
  const mayName = tap === ReferralTap.Named;
  await recordDecision(offer.id, true, mayName);
  await tellTheAsker(offer, mayName);
  return askedForThemLine(language, offer.referral_name, asker);
}

/**
 * The reader's tap on the referral card, acted on; the line he reads back.
 * Null when there is no undecided offer here, or the relay could not go —
 * then the turn runs as before.
 */
export async function settleReferralTap(
  recipientId: string,
  threadId: number,
  tap: ReferralTap,
  language: RunLanguage,
): Promise<string | null> {
  const offer = await offeredReferral(recipientId, threadId);
  if (offer === null) return null;
  if (tap !== ReferralTap.No) return askTheReferral(recipientId, offer, tap, language);
  await recordDecision(offer.id, false, false);
  // His „no" reaches the asker as his ordinary decline: the button's own words.
  const [, declineLabel] = askChoices(language);
  const sent = await sendApprovedAskAnswer(recipientId, threadId, declineLabel);
  if (!sent.sent) {
    // eslint-disable-next-line no-console
    console.warn(`[referral] ask ${offer.id}: the decline could not be sent`);
  }
  return declinedLine(language, offer.asker_name?.trim() ?? '');
}
