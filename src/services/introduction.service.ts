import { query } from '../db/postgres/client';
import { sendPushNotification } from './notification.service';
import { recordProductEvent } from './productEvents.service';
import { setThreadStatus } from './threadStatus.service';
import {
  createThread,
  getThreadsByIntroRequestId,
  saveThreadMessage,
  userLanguage,
} from './threads.service';
import { scrubText } from './privacyScrub';
import { recordIntroOutcome } from './partH.service';
import { armIntroDebrief } from './debrief.service';
import { recordMutualWarmth } from './warmth.service';
import {
  introAcceptedOpening,
  introAcceptedPush,
  introAcceptedTitle,
  introAnsweredLine,
  introSnoozedLine,
} from './introOpening';
import { RunLanguage } from './runLanguage';
import { geoName } from './georgianCase';

export interface PendingRequest {
  id: number;
  target_name: string;
  message: string | null;
  requester_name: string | null;
  created_at: string;
  /** No mediator stored: the target themself answers (task 18). */
  direct: boolean;
}

export interface RespondedRequest {
  id: number;
  target_name: string;
  status: 'accepted' | 'declined';
  mediator_response: string | null;
  responded_at: string;
  // Context so a reply is shown with meaning, never a bare "accepted".
  mediator_name: string | null;
  message: string | null;
  created_at: string;
  ask_type: string;
}

const RESPONSE_WINDOW_DAYS = 7;

// A request is answered by its mediator — or, on a DIRECT request (no
// mediator stored, task 18), by the target themself. One condition, used by
// every responder-side read so the two shapes never diverge.
const RESPONDER_COND = (idx: number): string =>
  `(ir.mediator_user_id = $${idx} OR (ir.mediator_user_id IS NULL AND ir.target_user_id = $${idx}))`;

export async function getPendingRequestsForMediator(
  mediatorUserId: string,
): Promise<PendingRequest[]> {
  const result = await query<PendingRequest>(
    `SELECT ir.id, ir.target_name, ir.message, ir.created_at,
            u.name AS requester_name,
            (ir.mediator_user_id IS NULL) AS direct
     FROM introduction_requests ir
     LEFT JOIN "User" u ON u.id = ir.requester_user_id
     WHERE ${RESPONDER_COND(1)} AND ir.status = 'pending'
       AND (ir.snoozed_until IS NULL OR ir.snoozed_until <= NOW())
     ORDER BY ir.created_at ASC`,
    [mediatorUserId],
  );
  return result.rows;
}

/**
 * The single pending request behind an incoming-request thread, so the agent
 * has its request_id available to answer it. Scoped to this mediator + still
 * pending; returns null once answered.
 */
export async function getPendingRequestById(
  mediatorUserId: string,
  requestId: number,
): Promise<PendingRequest | null> {
  const result = await query<PendingRequest>(
    `SELECT ir.id, ir.target_name, ir.message, ir.created_at,
            u.name AS requester_name,
            (ir.mediator_user_id IS NULL) AS direct
     FROM introduction_requests ir
     LEFT JOIN "User" u ON u.id = ir.requester_user_id
     WHERE ir.id = $1 AND ${RESPONDER_COND(2)} AND ir.status = 'pending'
     LIMIT 1`,
    [requestId, mediatorUserId],
  );
  return result.rows[0] ?? null;
}

/**
 * Ticket 20 row 211 — what the conversation IS, whether or not it still needs
 * an answer.
 *
 * `getPendingRequestById` above has `status = 'pending'` in it and says so:
 * „returns null once answered". That is right for the question „is there
 * something here for the owner to decide", and it is the whole of the fault
 * the seat found, because it is also the only thing that ever told a run what
 * the thread was about.
 *
 * Lika's thread 17723, 18 September. Title „Salome Parkosadze → ნინია
 * აბრამიშვილი", carrying request 1090, which names both of them.
 *
 *   13:41:02  she accepts — and with that the request leaves her prompt
 *   13:45:55  „კი. სალომე გააცანი"
 *   13:46:07  „რომელი სალომეს გულისხმობ?" with FOUR buttons
 *   13:47:28  and then the direction reversed: it told her she would be
 *             introducing Ninia TO Salome
 *
 * Nothing was hallucinated. By 13:45 the run genuinely did not know which
 * Salome, or who was asking whom, because the one record that said so had been
 * filtered out four minutes earlier for being answered. It searched her
 * contacts, found three Salomes, and asked — which is the correct move for a
 * run that has been told nothing.
 *
 * So this read has no status filter. It is context, never a pending item: the
 * caller renders it as a statement of fact and the buttons still come from the
 * pending read, so an answered request cannot be offered for answering twice.
 */
export interface ThreadRequest {
  id: number;
  requester_name: string | null;
  target_name: string;
  message: string | null;
  status: string;
  responded_at: string | null;
  mediator_response: string | null;
  /** No mediator stored: the target themself answers (task 18). */
  direct: boolean;
}

export async function getRequestOnThread(
  responderUserId: string,
  requestId: number,
): Promise<ThreadRequest | null> {
  const result = await query<ThreadRequest>(
    `SELECT ir.id, ir.target_name, ir.message, ir.status, ir.responded_at,
            ir.mediator_response,
            u.name AS requester_name,
            (ir.mediator_user_id IS NULL) AS direct
     FROM introduction_requests ir
     LEFT JOIN "User" u ON u.id = ir.requester_user_id
     WHERE ir.id = $1 AND ${RESPONDER_COND(2)}
     LIMIT 1`,
    [requestId, responderUserId],
  );
  return result.rows[0] ?? null;
}

export async function getRecentResponsesForRequester(
  requesterUserId: string,
): Promise<RespondedRequest[]> {
  const result = await query<RespondedRequest>(
    `SELECT ir.id, ir.target_name, ir.status, ir.mediator_response, ir.responded_at,
            ir.message, ir.created_at, ir.ask_type,
            COALESCE(m.name, ir.target_name) AS mediator_name
     FROM introduction_requests ir
     LEFT JOIN "User" m ON m.id = ir.mediator_user_id
     WHERE ir.requester_user_id = $1
       AND ir.status IN ('accepted', 'declined')
       AND ir.responded_at > NOW() - INTERVAL '${RESPONSE_WINDOW_DAYS} days'
     ORDER BY ir.responded_at DESC`,
    [requesterUserId],
  );
  return result.rows;
}

export interface IntroStatusRow {
  target_name: string;
  responder_name: string | null;
  status: string;
  response: string | null;
  asked_at: string;
  responded_at: string | null;
  direct: boolean;
}

/**
 * The requester's introductions as SYSTEM DATA (task 17): "did she reply?"
 * must be answerable from a tool result, never from loose thread text. Both
 * pending and recently-answered rows, newest first.
 */
export async function getIntroStatusForRequester(
  requesterUserId: string,
): Promise<IntroStatusRow[]> {
  const result = await query<IntroStatusRow>(
    `SELECT ir.target_name,
            COALESCE(m.name, CASE WHEN ir.mediator_user_id IS NULL THEN ir.target_name END)
              AS responder_name,
            ir.status,
            ir.mediator_response AS response,
            ir.created_at AS asked_at,
            ir.responded_at,
            (ir.mediator_user_id IS NULL) AS direct
     FROM introduction_requests ir
     LEFT JOIN "User" m ON m.id = ir.mediator_user_id
     WHERE ir.requester_user_id = $1
       AND (ir.status = 'pending'
            OR ir.responded_at > NOW() - INTERVAL '${RESPONSE_WINDOW_DAYS} days')
     ORDER BY COALESCE(ir.responded_at, ir.created_at) DESC
     LIMIT 20`,
    [requesterUserId],
  );
  return result.rows;
}

/**
 * Ticket 20, the seat's 293 — „something that doesn't appear to have happened".
 *
 * Test 2 asked „When did I agree to introduce Netai Test 1 to Netai Test 3?
 * Give me the date and time." Forty minutes earlier, in that same account,
 * they had typed „Yes, happy to introduce them. Netai Test 3 is a good friend
 * of mine", and the relay that went out at 18:51:07 exists because of it. The
 * answer they got was that there is no such agreement in their history and
 * they were asking about something that did not appear to have happened.
 *
 * THE MODEL DID THE RIGHT THING. It called `get_intro_status`, once, and the
 * result was empty. The fault is entirely in what that tool can see: it is
 * `getIntroStatusForRequester`, and its own name is the bug report. The person
 * asking was the MEDIATOR. Nothing in the tool reads the mediator's side, and
 * nothing in it reads the shape this particular agreement took at all — an ask
 * answered and passed on lives in `task_asks`, not in `introduction_requests`.
 *
 * So two readers, for the two ways a person ends up having agreed to introduce
 * somebody. Neither replaces the requester's list; a person can be all three.
 */
export interface MediatorIntroRow {
  requester_name: string | null;
  target_name: string;
  status: string;
  response: string | null;
  asked_at: string;
  responded_at: string | null;
}

/** Introductions this person was ASKED to make, whatever they answered. */
export async function getIntroStatusForMediator(
  mediatorUserId: string,
): Promise<MediatorIntroRow[]> {
  const result = await query<MediatorIntroRow>(
    `SELECT r.name AS requester_name,
            ir.target_name,
            ir.status,
            ir.mediator_response AS response,
            ir.created_at AS asked_at,
            ir.responded_at
     FROM introduction_requests ir
     LEFT JOIN "User" r ON r.id = ir.requester_user_id
     WHERE ir.mediator_user_id = $1
     ORDER BY COALESCE(ir.responded_at, ir.created_at) DESC
     LIMIT 20`,
    [mediatorUserId],
  );
  return result.rows;
}

export interface PassedOnRow {
  /** Who originally asked this person for help. */
  asker_name: string | null;
  /** Who they passed it on to — the person they agreed to bring in. */
  passed_to_name: string | null;
  question: string;
  passed_on_at: string;
  answered_at: string | null;
}

/**
 * Questions this person passed on to somebody else — the act of agreeing, as
 * the product actually records it. A relay is a child ask whose sender is this
 * person; the parent is the ask they were answering.
 */
export async function getPassedOnAsks(userId: string): Promise<PassedOnRow[]> {
  const result = await query<PassedOnRow>(
    `SELECT au.name AS asker_name,
            tu.name AS passed_to_name,
            c.question,
            c.created_at AS passed_on_at,
            c.answered_at
     FROM task_asks c
     JOIN task_asks p ON p.id = c.parent_ask_id
     LEFT JOIN "User" au ON au.id = p.from_user_id
     LEFT JOIN "User" tu ON tu.id = c.to_user_id
     WHERE c.from_user_id = $1::int
     ORDER BY c.created_at DESC
     LIMIT 20`,
    [userId],
  );
  return result.rows;
}

export interface TargetIntroRow {
  /** Who wanted to meet this person. */
  requester_name: string | null;
  /** Who vouched — null when they were asked directly. */
  bridge_name: string | null;
  /** The words this person actually received. */
  what_was_asked: string | null;
  asked_at: string;
  /** When this person answered, if they did. */
  answered_at: string | null;
  status: string;
}

/**
 * The FOURTH side, and the seat found it by being signed in as it.
 *
 * Three readers went live at 20:35 — requested, asked of me, passed on — and
 * the first question asked of the new build came from Test 3, who is none of
 * those. Test 3 is the TARGET: the person a stranger's assistant wrote to, who
 * agreed to meet somebody they do not know, and who then could not ask their
 * own assistant what they had agreed to. The row is right there — ask 2674,
 * relayed at 18:51:07, answered „Yes, happy to meet" — and it was invisible to
 * its owner.
 *
 * Of the four, the target has the least context and the most reason to check.
 * The requester knows they asked. The mediator knows they helped. The target
 * got a message out of nowhere.
 *
 * Two sources again, for the same reason as the other two readers: an
 * introduction reaches a target either as an `introduction_requests` row
 * naming them, or as a RELAYED ask — a child ask addressed to them, whose
 * parent is the question their bridge was answering. `origin_user_id` is who
 * paid for the chain and therefore who wanted the meeting; `from_user_id` on
 * the child is the bridge who vouched.
 */
export async function getIntroStatusForTarget(userId: string): Promise<TargetIntroRow[]> {
  const result = await query<TargetIntroRow>(
    `SELECT r.name AS requester_name,
            m.name AS bridge_name,
            ir.message AS what_was_asked,
            ir.created_at AS asked_at,
            ir.responded_at AS answered_at,
            ir.status
       FROM introduction_requests ir
       LEFT JOIN "User" r ON r.id = ir.requester_user_id
       LEFT JOIN "User" m ON m.id = ir.mediator_user_id
      WHERE ir.target_user_id = $1::int
     UNION ALL
     SELECT o.name AS requester_name,
            b.name AS bridge_name,
            c.question AS what_was_asked,
            c.created_at AS asked_at,
            c.answered_at,
            c.status
       FROM task_asks c
       LEFT JOIN "User" o ON o.id = c.origin_user_id
       LEFT JOIN "User" b ON b.id = c.from_user_id
      WHERE c.to_user_id = $1::int AND c.parent_ask_id IS NOT NULL
     ORDER BY asked_at DESC
     LIMIT 20`,
    [userId],
  );
  return result.rows;
}

/**
 * Is this thread's introduction request still unanswered? An outgoing-request
 * thread waiting on the mediator is WAITING, not needs_you — the asker owes
 * nothing (ticket 5 item B2: thread 8556 read needs_you while the recipient
 * had not answered).
 */
export async function hasPendingIntroForThread(introRequestId: number | null): Promise<boolean> {
  if (introRequestId === null) return false;
  const result = await query<{ id: number }>(
    `SELECT id FROM introduction_requests WHERE id = $1 AND status = 'pending' LIMIT 1`,
    [introRequestId],
  );
  return result.rows.length > 0;
}

/**
 * HOW an accepted introduction is made — Misho's design, 20 September.
 *
 * The assistant asking a mediator to connect two people must also ask, up
 * front, which of these it is. The mediator chooses; the product does not
 * assume, and until now it assumed `direct` every time without saying so.
 *
 *   'direct'        the requester is given the target's contact, as today
 *   'via_mediator'  the contact is NOT handed over — the mediator stays in
 *                   the middle and carries the messages
 *
 * A stored NULL is every request answered before the question existed. It is
 * not a third option: it means nobody was asked.
 */
export type IntroChannel = 'direct' | 'via_mediator';

export type IntroductionAction = 'accept' | 'decline' | 'snooze';
export type ResolveSource = 'chat' | 'button';

export interface ResolveOutcome {
  ok: boolean;
  /** The action had already been applied — treated as success (idempotent). */
  already?: boolean;
  /** Resulting request status: accepted | declined | pending (snooze keeps it pending). */
  status?: string;
  snoozedUntil?: string | null;
  code?: 'not_found' | 'conflict';
  error?: string;
}

const DEFAULT_SNOOZE_DAYS = 3;
const MIN_SNOOZE_DAYS = 1;
const MAX_SNOOZE_DAYS = 30;
const ERR_NOT_FOUND = 'მოთხოვნა ვერ მოიძებნა';
const ERR_ALREADY_ANSWERED = 'ამ მოთხოვნაზე უკვე გაქვს პასუხი';

interface RequestRow {
  id: number;
  request_ref: string;
  requester_user_id: number;
  mediator_user_id: number | null;
  target_name: string;
  target_user_id: number | null;
  target_phone: string | null;
  message: string | null;
  status: string;
  /** Row 210: the requester's goal this was raised for, when there was one. */
  requester_task_id: number | null;
}

async function loadRequestForMediator(
  mediatorUserId: string,
  target: { requestId?: number; requestRef?: string },
): Promise<RequestRow | null> {
  const byRef = target.requestRef !== undefined;
  const result = await query<RequestRow>(
    `SELECT ir.id, ir.request_ref, ir.requester_user_id, ir.mediator_user_id,
            ir.target_name, ir.target_user_id, ir.target_phone, ir.message, ir.status,
            ir.requester_task_id
     FROM introduction_requests ir
     WHERE ${RESPONDER_COND(1)} AND ${byRef ? 'ir.request_ref = $2' : 'ir.id = $2'}
     LIMIT 1`,
    [mediatorUserId, byRef ? target.requestRef : target.requestId],
  );
  return result.rows[0] ?? null;
}

// The outcome as a MESSAGE in the requester's thread. A push notification
// fires once, on one device, and is gone; the thread is what persists, and it
// used to keep reading "ველოდები პასუხს" forever after a decline — the asker
// concluded the person ignored him when she had answered clearly (ticket 4
// PART B miss 3).
function outcomeMessage(req: RequestRow, action: IntroductionAction, response?: string): string {
  const answer = response?.trim() ? `\n\nპასუხი: „${scrubText(response.trim())}"` : '';
  const direct = req.mediator_user_id === null;
  if (action === 'accept') {
    // Direct case (task 18): the target themself agreed — that IS the outcome.
    // Mediated accepts get the richer outcome from deliverAcceptOutcome.
    return direct
      ? `${req.target_name} დათანხმდა გაცნობას.${answer} ახლა თავისუფლად შეგიძლია მისწერო — იცის ვინ ხარ და რატომ.`
      : `${geoName(req.target_name, 'on')} გაცნობის მოთხოვნა მიღებულია.${answer}`;
  }
  return direct
    ? `${geoName(req.target_name, 'erg')} გაცნობაზე ამჯერად უარი თქვა.${answer} სხვა გზა მოვძებნოთ?`
    : `${geoName(req.target_name, 'on')} გაცნობის მოთხოვნაზე ამჯერად უარი მოვიდა — შუამავალმა ვერ დაგეხმარა.${answer} სხვა გზა მოვძებნოთ?`;
}

interface AcceptOutcome {
  /** Extra lines appended to the requester's outcome message. */
  requesterExtra: string;
  /** Closing line for the mediator's own thread — what happens next. */
  mediatorFollowUp: string;
}

/**
 * Task 16 — Accept must PRODUCE something. 13 introductions were accepted on
 * this system and not one gave the requester a way to talk to the target or
 * told the target anything. On a mediated accept:
 *   1. the requester's thread gets the target's contact (the one the mediator
 *      holds — accepting the introduction IS consenting to connect the two;
 *      same consent shape as the share_contact path);
 *   2. a registered target gets their own thread + push saying who is coming
 *      and on whose word — never the requester's number, only their name;
 *   3. the mediator's thread says what was done in their name.
 * Degrades honestly when the target cannot be resolved: the requester is told
 * to get the contact from the mediator directly.
 */
async function deliverAcceptOutcome(
  req: RequestRow,
  mediatorName: string,
  channel: IntroChannel,
): Promise<AcceptOutcome> {
  // The target's phone: the stored one, or the single match in the MEDIATOR's
  // own phonebook (it is their contact to give).
  let targetPhone = req.target_phone;
  if (!targetPhone && req.mediator_user_id !== null) {
    const found = await query<{ phone: string }>(
      `SELECT ua.phone FROM "UserAlias" ua
       WHERE ua."contactId" = $1 AND LOWER(ua.alias) = LOWER($2)
       LIMIT 2`,
      [req.mediator_user_id, req.target_name],
    );
    if (found.rows.length === 1) targetPhone = found.rows[0].phone;
  }

  // A registered target learns what happens next (their own thread + push).
  let targetUserId = req.target_user_id;
  if (targetUserId === null && targetPhone) {
    const member = await query<{ userId: number }>(
      `SELECT "userId" FROM "UserPhone"
       WHERE regexp_replace(phone, '\\D', '', 'g') = regexp_replace($1, '\\D', '', 'g')
       LIMIT 1`,
      [targetPhone],
    );
    targetUserId = member.rows[0]?.userId ?? null;
  }

  const requesterName = await query<{ name: string | null }>(
    'SELECT name FROM "User" WHERE id = $1 LIMIT 1',
    [req.requester_user_id],
  );
  const requester = requesterName.rows[0]?.name?.trim() || 'Netai-ს მომხმარებელი';

  if (targetUserId !== null && String(targetUserId) !== String(req.requester_user_id)) {
    try {
      // The TARGET's own language. This is the message that tells somebody
      // their phone number has left another person's phonebook, so of the
      // three the introduction writes it is the one that can least afford to
      // arrive in a script they cannot read.
      const language = await userLanguage(String(targetUserId)).catch(() => 'ka' as RunLanguage);
      const thread = await createThread(
        String(targetUserId),
        'regular',
        introAcceptedTitle(language, requester),
      );
      await saveThreadMessage(
        thread.id,
        targetUserId,
        'assistant',
        introAcceptedOpening(
          language,
          mediatorName,
          requester,
          req.message?.trim() ? scrubText(req.message.trim()) : null,
          channel === 'direct' && targetPhone !== null,
        ),
      );
      await sendPushNotification(String(targetUserId), {
        ...introAcceptedPush(language, mediatorName, requester),
        url: `/chat/${thread.id}`,
      }).catch(() => undefined);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(
        `[intro] target-side outcome failed for request ${req.id}:`,
        (err as Error).message,
      );
    }
  }

  /**
   * THE MEDIATOR'S CHOICE, and it is the whole of item 5.
   *
   * „ჩემი გავლით" means the contact is not handed over. The requester is told
   * the introduction stands and that the way to reach the target is through
   * the person who agreed to it — which is the arrangement they chose, not a
   * failure to find a number.
   *
   * It is kept apart from the „no number found" case below on purpose: those
   * two produce the same silence and mean opposite things. One is somebody
   * deciding to stay in the middle; the other is us not knowing a number. A
   * reader who cannot tell them apart will chase the mediator for a contact
   * they deliberately withheld.
   */
  if (channel === 'via_mediator') {
    return {
      requesterExtra:
        `\n\n${geoName(mediatorName, 'erg')} აირჩია, რომ კავშირი მის გავლით გაგრძელდეს — ` +
        `ნომერი არ გადმოუციათ და ეს მისი გადაწყვეტილებაა, არა ხარვეზი. ` +
        `დამიწერე, რისი გადაცემა გინდა ${geoName(req.target_name, 'dat')}, და ${geoName(mediatorName, 'dat')} გადავცემ.`,
      mediatorFollowUp:
        `მადლობა! ${geoName(requester, 'dat')} ვაცნობე, რომ თანხმობა მოგვეცი და რომ ` +
        `კავშირი შენი გავლით გაგრძელდება. ${geoName(req.target_name, 'gen')} ნომერი არავის გადაეცა.`,
    };
  }

  const requesterExtra = targetPhone
    ? `\n\n${geoName(req.target_name, 'gen')} ნომერი ${geoName(mediatorName, 'gen')} წიგნაკიდან: ${targetPhone}. ` +
      `მისწერე და უთხარი, რომ ${geoName(mediatorName, 'erg')} გაგაცნოთ${targetUserId !== null ? ' — მას უკვე ვაცნობეთ, რომ შესაძლოა დაუკავშირდე' : ''}.`
    : `\n\nნომერი ავტომატურად ვერ მოვძებნე — ${geoName(mediatorName, 'dat')} პირდაპირ ჰკითხე ${geoName(req.target_name, 'gen')} კონტაქტი, თანხმობა უკვე გაქვს.`;

  const mediatorFollowUp = targetPhone
    ? `მადლობა! ${geoName(requester, 'dat')} გადავეცი ${geoName(req.target_name, 'gen')} კონტაქტი${targetUserId !== null ? ` და ${geoName(req.target_name, 'dat')}-აც ვაცნობე` : ''}. ისინი უკვე დაუკავშირდებიან ერთმანეთს.`
    : `მადლობა! ${geoName(requester, 'dat')} ვაცნობე შენი თანხმობა. ${geoName(req.target_name, 'gen')} კონტაქტი ვერ ვიპოვე შენს წიგნაკში — შესაძლოა ${geoName(requester, 'erg')} პირდაპირ გთხოვოს.`;

  return { requesterExtra, mediatorFollowUp };
}

/**
 * Reflect the request's outcome on BOTH of its threads so every device shows
 * the same state: the mediator's incoming thread is settled (or snoozed), the
 * requester's outgoing thread gets the outcome WRITTEN INTO IT and flips to
 * "answer arrived". Best-effort.
 */
async function syncRequestThreads(
  req: RequestRow,
  action: IntroductionAction,
  response?: string,
  outcome?: AcceptOutcome,
): Promise<void> {
  try {
    const threads = await getThreadsByIntroRequestId(req.id);
    for (const thread of threads) {
      const owner = String(thread.user_id);
      // Each side's own language — the two readers need not share one, and
      // this caption is on their screen as of 20 September.
      const ownerLanguage = await userLanguage(owner).catch(() => 'ka' as RunLanguage);
      if (thread.type === 'incoming_request') {
        if (action === 'snooze') {
          await setThreadStatus(owner, thread.id, 'waiting', {
            statusLine: introSnoozedLine(ownerLanguage),
            requestRef: req.request_ref,
          });
        } else {
          // The responder sees what happened in their name (task 16) — on
          // EVERY resolve, not only a mediated accept: request 925's direct
          // accepter got pure silence, just a thread flipping to done
          // (ticket 8 task 3). The richer mediated-accept follow-up wins
          // when it exists; otherwise a plain honest close.
          const close =
            outcome?.mediatorFollowUp ??
            (action === 'accept'
              ? 'მადლობა! შენი თანხმობა გადაეცა — მან იცის, რომ დათანხმდი, და შესაძლოა მალე დაგიკავშირდეს.'
              : 'გასაგებია — უარი მშვიდად გადაეცა. შენი სახელით მეტი არაფერი გაკეთდება ამ თხოვნაზე.');
          await saveThreadMessage(thread.id, thread.user_id, 'assistant', close).catch(
            () => undefined,
          );
          await setThreadStatus(owner, thread.id, 'done', { requestRef: req.request_ref });
        }
      } else if (thread.type === 'outgoing_request' && action !== 'snooze') {
        await saveThreadMessage(
          thread.id,
          thread.user_id,
          'assistant',
          outcomeMessage(req, action, response) + (outcome?.requesterExtra ?? ''),
        ).catch(() => undefined);
        await setThreadStatus(owner, thread.id, 'needs_you', {
          statusLine: introAnsweredLine(ownerLanguage),
          requestRef: req.request_ref,
        });
      }
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(`[intro] thread sync failed for request ${req.id}:`, (err as Error).message);
  }
}

/**
 * Ticket 20 row 210 — the answer walks to the goal instead of waiting to be
 * asked about.
 *
 * The seat's run: Salome's introduction was agreed at 13:41:02 and her own
 * goal thread said nothing until she typed „anything new?" at 14:06:46.
 * Nothing had failed. Her push went, twice, and the request's own thread was
 * written to a second later — but the GOAL, the thread she was living in and
 * the thing that actually does the work, had no way of hearing, because until
 * today nothing tied a request to the goal it came out of.
 *
 * An ANSWERED ASK has woken its goal for weeks. An answered introduction is
 * the same event wearing a different table, and it had nothing to wake.
 *
 * Best-effort on purpose, and after the threads are synced: the answer itself
 * is recorded and visible whatever happens here, and an introduction must
 * never fail to be accepted because a wake could not be scheduled.
 */
async function wakeRequestersGoal(req: RequestRow, accepted: boolean): Promise<void> {
  if (req.requester_task_id === null) return;
  try {
    const [{ startIntroOutcome }, { introOutcomeEvent }] = await Promise.all([
      import('./taskEngine.service'),
      import('./taskEngine.events'),
    ]);
    startIntroOutcome(req.requester_task_id, introOutcomeEvent(req.target_name, accepted));
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(
      `[intro] could not wake goal ${req.requester_task_id} for request ${req.id}:`,
      (err as Error).message,
    );
  }
}

async function notifyRequester(req: RequestRow, accepted: boolean): Promise<void> {
  const body = accepted
    ? `${geoName(req.target_name, 'on')} გაცნობის მოთხოვნაზე პასუხი მოვიდა. გახსენი Netai.`
    : `${geoName(req.target_name, 'on')} გაცნობის მოთხოვნაზე უარი მიიღე.`;
  await sendPushNotification(String(req.requester_user_id), {
    title: 'Netai — გაცნობის პასუხი',
    body,
    url: '/chat',
  }).catch(() => undefined);
}

/**
 * The ONE place an introduction request gets answered or snoozed — the chat
 * tool (respond_to_introduction) and the REST buttons both land here, so
 * status guards, requester push, thread sync and analytics behave identically
 * regardless of where the decision was made. Idempotent: repeating an already-
 * applied answer succeeds; a CONFLICTING answer is refused.
 */
export async function resolveIntroductionRequest(
  mediatorUserId: string,
  target: { requestId?: number; requestRef?: string },
  action: IntroductionAction,
  opts: {
    response?: string;
    snoozeDays?: number;
    source: ResolveSource;
    /** Required on a MEDIATED accept — see IntroChannel. */
    channel?: IntroChannel;
  },
): Promise<ResolveOutcome> {
  const req = await loadRequestForMediator(mediatorUserId, target);
  if (req === null) return { ok: false, code: 'not_found', error: ERR_NOT_FOUND };

  if (action === 'snooze') {
    if (req.status !== 'pending') {
      return { ok: false, code: 'conflict', status: req.status, error: ERR_ALREADY_ANSWERED };
    }
    const days = Math.min(
      MAX_SNOOZE_DAYS,
      Math.max(MIN_SNOOZE_DAYS, opts.snoozeDays ?? DEFAULT_SNOOZE_DAYS),
    );
    const updated = await query<{ snoozed_until: string }>(
      `UPDATE introduction_requests
       SET snoozed_until = NOW() + ($2 || ' days')::interval
       WHERE id = $1 AND status = 'pending'
       RETURNING snoozed_until`,
      [req.id, days],
    );
    if (updated.rows.length === 0) {
      return { ok: false, code: 'conflict', error: ERR_ALREADY_ANSWERED };
    }
    void recordProductEvent(mediatorUserId, 'request_resolved', {
      action,
      source: opts.source,
      request_ref: req.request_ref,
      days,
    });
    await syncRequestThreads(req, action);
    return { ok: true, status: 'pending', snoozedUntil: updated.rows[0].snoozed_until };
  }

  const newStatus = action === 'accept' ? 'accepted' : 'declined';
  if (req.status === newStatus) return { ok: true, already: true, status: newStatus };
  if (req.status !== 'pending') {
    return { ok: false, code: 'conflict', status: req.status, error: ERR_ALREADY_ANSWERED };
  }

  // status='pending' in the WHERE guards the race of two simultaneous answers:
  // exactly one wins; the loser sees rowCount 0 and reports the conflict.
  const updated = await query(
    `UPDATE introduction_requests
     SET status = $1, mediator_response = $2, responded_at = NOW(), snoozed_until = NULL,
         responded_by_user_id = $4::int,
         intro_channel = COALESCE($5::text, intro_channel)
     WHERE id = $3 AND status = 'pending'`,
    [newStatus, opts.response ?? null, req.id, mediatorUserId, opts.channel ?? null],
  );
  if ((updated.rowCount ?? 0) === 0) {
    return { ok: false, code: 'conflict', error: ERR_ALREADY_ANSWERED };
  }

  void recordProductEvent(mediatorUserId, 'request_resolved', {
    action,
    source: opts.source,
    request_ref: req.request_ref,
  });
  // C9.7: the outcome as evidence — declined/accepted land at resolve time.
  void recordIntroOutcome(
    req.requester_user_id,
    req.id,
    action === 'accept' ? 'accepted' : 'declined',
  );
  // D49: an accepted introduction arms the requester's 3-day debrief. Best-
  // effort — the accept itself must never fail on this.
  if (action === 'accept') {
    await armIntroDebrief(String(req.requester_user_id), req.id, req.target_name).catch(
      (err: unknown) =>
        // eslint-disable-next-line no-console
        console.error('[debrief] intro arm failed:', (err as Error).message),
    );
    // An accepted introduction is warmth, on both sides, and it cost the
    // accepter something real (ticket 9 task 13.1, the founder's third
    // source). Best-effort: the accept stands whatever this does.
    void recordMutualWarmth(
      String(req.requester_user_id),
      String(mediatorUserId),
      'intro_accepted',
      `intro_${req.id}`,
    ).catch((err: unknown) =>
      // eslint-disable-next-line no-console
      console.error('[warmth] intro accept failed:', (err as Error).message),
    );
  }
  await notifyRequester(req, action === 'accept');
  // A mediated accept must PRODUCE the introduction (task 16); a direct
  // accept's outcome is the target's own yes, already in outcomeMessage.
  let outcome: AcceptOutcome | undefined;
  if (action === 'accept' && req.mediator_user_id !== null) {
    const mediatorName = await query<{ name: string | null }>(
      'SELECT name FROM "User" WHERE id = $1 LIMIT 1',
      [req.mediator_user_id],
    );
    outcome = await deliverAcceptOutcome(
      req,
      mediatorName.rows[0]?.name?.trim() || 'შუამავალმა',
      // A request answered before the question existed carries NULL, and the
      // behaviour it actually got was `direct`. Reading it as anything else
      // would rewrite what already happened to those people.
      opts.channel ?? 'direct',
    ).catch((err: unknown) => {
      // The accept itself must never fail on outcome delivery — log and
      // degrade to the plain acceptance message.
      // eslint-disable-next-line no-console
      console.error(
        `[intro] outcome delivery failed for request ${req.id}:`,
        (err as Error).message,
      );
      return undefined;
    });
  }
  await syncRequestThreads(req, action, opts.response, outcome);
  await wakeRequestersGoal(req, action === 'accept');
  return { ok: true, status: newStatus };
}
