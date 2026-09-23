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
  introAnsweredPush,
  introCancelledLine,
  introCancelledNote,
  introWithdrawnByOwnerNote,
  introMediatorFollowUp,
  introOutcomeLine,
  introRequesterExtra,
  introSnoozedLine,
} from './introOpening';
import { RunLanguage } from './runLanguage';

export interface PendingRequest {
  id: number;
  /**
   * The UUID the POST route takes. `id` is the integer `check_my_inbox`
   * dresses as `req_<id>`, and the two were never the same identifier — which
   * is the trap `GET /requests` exists to keep people out of. Both are carried
   * so no caller has to guess which one its consumer wants.
   */
  request_ref: string;
  target_name: string;
  message: string | null;
  requester_name: string | null;
  /**
   * WHO IS ASKING, as an id rather than only as a name.
   *
   * Answering one of these writes to a real person, so the tester's seat has
   * been unable to touch `POST /requests/:ref/:action` at all — the payload
   * named the counterpart and never said whether that name belongs to
   * somebody real or to one of the fictional test accounts. Their 379
   * asked for exactly this and ranked it last themselves.
   */
  requester_user_id: number | null;
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
    `SELECT ir.id, ir.request_ref, ir.target_name, ir.message, ir.created_at,
            ir.requester_user_id,
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
    `SELECT ir.id, ir.request_ref, ir.target_name, ir.message, ir.created_at,
            ir.requester_user_id,
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
  /**
   * Row 251: what to pass to `ask_contact`, present only on an accepted
   * introduction whose mediator handed the contact over. Null everywhere else.
   * The connector turns this into an opaque ref — numbers do not reach it.
   */
  target_phone?: string | null;
  /** The goal the introduction was asked for, so the ask lands in the right one. */
  for_goal_id?: number | null;
  response: string | null;
  asked_at: string;
  responded_at: string | null;
  /**
   * There was no go-between: the person the owner wanted to meet answered for
   * themselves. RENAMED from `direct`, which is the whole point of this change.
   *
   * The seat's 407 §5b: an hour after mediator 171870 chose `via_mediator` on
   * request 1289 — staying in the middle, no number passed on — the assistant
   * told the owner that person „will connect you directly". The outcome
   * message on the request's own thread had said it correctly; the plan was
   * written in a DIFFERENT thread, and there the model had this tool's result
   * and a field called `direct`.
   *
   * It read the obvious way. `direct` meant „nobody is in the middle of the
   * REQUEST"; it was taken to mean „the connection will be direct", which is
   * the channel — a different fact, and the one that is somebody else's
   * decision about their own privacy.
   */
  answered_by_the_person_themselves: boolean;
  /**
   * Row 223's answer, finally readable: did the mediator hand the contact over
   * (`direct`), or keep the connection through themselves (`via_mediator`)?
   *
   * NULL is not „no". It is „nobody has said" — the request is unanswered, or
   * it was answered before the channel was ever recorded. On NULL the owner
   * must not be told either thing.
   */
  intro_channel: string | null;
  /**
   * The one question the model is actually asking when it writes a next step:
   * may I tell the owner they can reach this person themselves? True only on a
   * recorded `direct`; false on a recorded `via_mediator`; null when nobody
   * has said, which is not permission.
   */
  contact_handed_over: boolean | null;
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
            (ir.mediator_user_id IS NULL) AS answered_by_the_person_themselves,
            ir.intro_channel,
            CASE WHEN ir.intro_channel IS NULL THEN NULL
                 ELSE ir.intro_channel = 'direct' END AS contact_handed_over,
            /**
             * ROW 251 — THE HANDLE, WITHOUT WHICH THE CHANNEL IS A SENTENCE.
             * (No backticks in this comment: it lives inside a template literal,
             * and one of them ended the SQL string this morning too.)
             *
             * The tester's trace, 09:49: the owner said „write to Netai Test 6
             * now", the model searched their phonebook twice, found nobody —
             * OF COURSE it found nobody, not knowing the person is the entire
             * reason there was an introduction — and answered „I have no way
             * to send them a question through the app on your behalf. Do you
             * have their number to share?"
             *
             * Everything else in the row was in place by then: the plan gate
             * accepts them, the acceptance records their number. What was
             * missing is that NOTHING HANDED THE MODEL SOMETHING IT COULD PASS
             * TO ask_contact. It could see „accepted, contact handed over" and
             * a name, and a name is not an argument.
             *
             * ONLY WHEN THE MEDIATOR CHOSE TO HAND THE CONTACT OVER. On
             * "via_mediator" they decided to stay in the middle — surfacing the
             * number there would undo their choice, which is theirs and not the
             * product's. And only on an ACCEPTED request, for the obvious
             * reason.
             */
            CASE WHEN ir.status = 'accepted' AND ir.intro_channel = 'direct'
                 THEN ir.target_phone END AS target_phone,
            CASE WHEN ir.status = 'accepted' AND ir.intro_channel = 'direct'
                 THEN ir.requester_task_id END AS for_goal_id
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
  /** Row 210 reopened: the chat it was asked in, when there was no goal. */
  origin_thread_id: number | null;
}

async function loadRequestForMediator(
  mediatorUserId: string,
  target: { requestId?: number; requestRef?: string },
): Promise<RequestRow | null> {
  const byRef = target.requestRef !== undefined;
  const result = await query<RequestRow>(
    `SELECT ir.id, ir.request_ref, ir.requester_user_id, ir.mediator_user_id,
            ir.target_name, ir.target_user_id, ir.target_phone, ir.message, ir.status,
            ir.requester_task_id, ir.origin_thread_id
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
/**
 * What the REQUESTER is told when the mediator answers, in their own language.
 *
 * Was Georgian on every account until 20 September — found by reading ahead
 * while the seat was mid-test, after the same read caught three Georgian
 * buttons in the channel refusal. The target's side had been localised that
 * morning; this side and the mediator's had not.
 */
async function outcomeMessage(
  req: RequestRow,
  action: IntroductionAction,
  response?: string,
): Promise<string> {
  const language = await userLanguage(String(req.requester_user_id)).catch(
    () => 'ka' as RunLanguage,
  );
  return introOutcomeLine(
    language,
    req.target_name,
    action === 'accept',
    req.mediator_user_id === null,
    response?.trim() ? scrubText(response.trim()) : null,
  );
}

interface AcceptOutcome {
  /** Extra lines appended to the requester's outcome message. */
  requesterExtra: string;
  /** Closing line for the mediator's own thread — what happens next. */
  mediatorFollowUp: string;
  /**
   * Did a number actually move? The requester's GOAL wake needs this, and
   * before request 1123 it was not given it — so the model guessed, and told
   * the asker the opposite of what the target had just been told. One fact,
   * one branch, three accounts that agree.
   */
  contactHandedOver: boolean;
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
  // Each side reads its own; the requester and the mediator need not share a
  // language, and the requester's line is the one that carries a phone number.
  const requesterLanguage = await userLanguage(String(req.requester_user_id)).catch(
    () => 'ka' as RunLanguage,
  );
  const mediatorLanguage =
    req.mediator_user_id === null
      ? requesterLanguage
      : await userLanguage(String(req.mediator_user_id)).catch(() => 'ka' as RunLanguage);

  if (channel === 'via_mediator') {
    return {
      requesterExtra: introRequesterExtra(
        requesterLanguage,
        mediatorName,
        req.target_name,
        null,
        true,
        false,
      ),
      mediatorFollowUp: introMediatorFollowUp(
        mediatorLanguage,
        requester,
        req.target_name,
        null,
        true,
        false,
      ),
      contactHandedOver: false,
    };
  }

  const targetWasTold = targetUserId !== null;
  return {
    requesterExtra: introRequesterExtra(
      requesterLanguage,
      mediatorName,
      req.target_name,
      targetPhone,
      false,
      targetWasTold,
    ),
    mediatorFollowUp: introMediatorFollowUp(
      mediatorLanguage,
      requester,
      req.target_name,
      targetPhone,
      false,
      targetWasTold,
    ),
    // The same branch the other two messages came from — targetPhone is what
    // actually decides whether anything moved.
    contactHandedOver: targetPhone !== null,
  };
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
          (await outcomeMessage(req, action, response)) + (outcome?.requesterExtra ?? ''),
        ).catch(() => undefined);
        /**
         * B31's second half — „needs_you" was wrong twice over.
         *
         * Thread 21454, 22 September: the mediator ACCEPTED at 08:41, the
         * outcome was written correctly with the answer quoted, and the badge
         * over it read „Needs your answer". Nothing was needed from him, and
         * it was never his move — the whole thread is somebody else answering
         * a question he asked. The mediator's own incoming thread goes to
         * `done` on the same event, ten lines up, so one side of one fact was
         * being closed and the other left open.
         *
         * `done`, on a decline as well as an accept: the request is answered
         * either way and there is nothing left to do IN THIS THREAD. What
         * happens next belongs to his goal, which row 210's wake tells.
         *
         * The caption still says what happened. „Done" alone would lose the
         * one thing he wants to see from the list.
         */
        await setThreadStatus(owner, thread.id, 'done', {
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
/**
 * Row 210 reopened — the answer reaches the chat the person is watching even
 * when there is no goal to wake.
 *
 * `wakeRequestersGoal` needs a task, and 21 September showed what that leaves
 * out: a real person typed „სთხოვე ლიკას გამაცნოს ნიტა ჩხეიძე" into an
 * ordinary chat, the mediator agreed two minutes later, and her chat said
 * nothing — the outcome went to the request's own thread, which she was not
 * looking at. Request 1156, `requester_task_id` NULL.
 *
 * WRITTEN, NOT RUN, and that is the whole design. The outgoing-request thread
 * already receives this exact sentence from `syncRequestThreads`; the same
 * text goes into the origin chat. No model call, so it cannot cost tokens, hit
 * an empty wallet, or be phrased into something the other two messages do not
 * say. A goal-backed request is untouched — it is told by its wake, measured
 * today at 23 and 41 seconds, and a second copy would be noise.
 *
 * Best-effort, after the threads are synced, like every other delivery here:
 * an introduction must never fail to be accepted because a chat could not be
 * written to.
 */
async function tellTheChatItWasAskedIn(
  req: RequestRow,
  action: IntroductionAction,
  response: string | undefined,
  outcome: AcceptOutcome | undefined,
): Promise<void> {
  if (req.requester_task_id !== null) return;
  if (req.origin_thread_id === null || action === 'snooze') return;
  try {
    // Never twice into the same thread: when the request was raised inside its
    // own outgoing thread there is nothing to add.
    const ownThreads = await getThreadsByIntroRequestId(req.id);
    if (ownThreads.some((t) => t.id === req.origin_thread_id)) return;
    const text = (await outcomeMessage(req, action, response)) + (outcome?.requesterExtra ?? '');
    await saveThreadMessage(req.origin_thread_id, req.requester_user_id, 'assistant', text);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(
      `[intro] could not tell chat ${req.origin_thread_id} about request ${req.id}:`,
      (err as Error).message,
    );
  }
}

async function wakeRequestersGoal(
  req: RequestRow,
  accepted: boolean,
  contactHandedOver: boolean,
): Promise<void> {
  if (req.requester_task_id === null) return;
  try {
    const [{ startIntroOutcome }, { introOutcomeEvent }] = await Promise.all([
      import('./taskEngine.service'),
      import('./taskEngine.events'),
    ]);
    startIntroOutcome(
      req.requester_task_id,
      introOutcomeEvent(req.target_name, accepted, contactHandedOver),
    );
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(
      `[intro] could not wake goal ${req.requester_task_id} for request ${req.id}:`,
      (err as Error).message,
    );
  }
}

async function notifyRequester(req: RequestRow, accepted: boolean): Promise<void> {
  // The requester's own language — a lock screen is all they see, and there is
  // no thread around it to make a foreign sentence guessable.
  const language = await userLanguage(String(req.requester_user_id)).catch(
    () => 'ka' as RunLanguage,
  );
  await sendPushNotification(String(req.requester_user_id), {
    ...introAnsweredPush(language, req.target_name, accepted),
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
  /**
   * ROW 251 — THE ACCEPTED INTRODUCTION LEARNS THE TARGET'S NUMBER HERE, AND
   * NOWHERE ELSE IT COULD.
   *
   * The row is „after the mediator's yes, the two assistants get a direct
   * channel". The wall in the way is `planAllows`, which matches on a PHONE and
   * refuses anyone the plan does not name — so an accepted introduction can
   * only lift that wall if it knows who, by number.
   *
   * MEASURED BEFORE WRITING THIS, because building the wall half first would
   * have fixed four cases and looked finished. Of every accepted introduction
   * there has ever been:
   *
   *     accepted                                   37
   *       carrying a target phone                  14
   *       carrying a requester task                13
   *       carrying BOTH, which is what the gate needs   4
   *
   * AND THE MISSING PHONE IS NOT AN OMISSION AT THE OTHER END. In a mediated
   * introduction the requester does not HAVE the number — that is the whole
   * reason they are asking a mediator — so `requestIntroduction` storing null
   * is the honest answer at that moment. Acceptance is the moment it becomes
   * known: the mediator is exactly the person who has it, because the target is
   * in THEIR phonebook, which is why they are the bridge.
   *
   * COALESCE, so a number already recorded is never overwritten — a direct
   * introduction resolved its phone at creation and that one is better evidence
   * than this lookup. Seven of the seven accepted rows that lack a phone and
   * carry a target user resolve through `UserPhone` today, so this is not a
   * hypothetical recovery.
   *
   * IT IS WRITTEN AND NEVER LOGGED. D149: a phone appears in a file as its last
   * four digits and never in full. This is a column, it is a join key for the
   * consent gate, and no line of this function prints it.
   */
  const updated = await query(
    `UPDATE introduction_requests
     SET status = $1, mediator_response = $2, responded_at = NOW(), snoozed_until = NULL,
         responded_by_user_id = $4::int,
         intro_channel = COALESCE($5::text, intro_channel),
         target_phone = COALESCE(
           target_phone,
           (SELECT up.phone FROM "UserPhone" up
             WHERE up."userId" = introduction_requests.target_user_id
             LIMIT 1)
         )
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
    /**
     * §16's measurement, and it is what turns that decision from stuck into
     * decidable.
     *
     * An accept with no channel is read as `direct` — the number goes. I
     * priced refusing it as „breaks the accept button for every real
     * mediator", and on 20 September at 13:43 the frontend removed plain
     * `accept` from its type union entirely: a channel-less accept can no
     * longer be COMPILED on their side, let alone sent. So the cost I wrote
     * into §16 has largely evaporated and the remaining question is empirical
     * — does anything still send one? An old cached client, a stale session,
     * a surface nobody remembered.
     *
     * So each one is counted, with the source, from now on. If this line is
     * silent for a week, refusing costs nothing and §16 answers itself. If it
     * is not silent, the thing that logged it is the thing that has to change
     * first, and we will know its name instead of guessing.
     */
    if (opts.channel === undefined) {
      // eslint-disable-next-line no-console
      console.warn(
        `[intro-accept-no-channel] request ${req.id} accepted via ${opts.source} with no ` +
          'channel — read as `direct`, so the number was handed over without the mediator ' +
          'being asked. See ADMIN_WRITE_OPERATIONS.md §16.',
      );
    }
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
  // The wake is told what the other two messages were told — see AcceptOutcome.
  await wakeRequestersGoal(req, action === 'accept', outcome?.contactHandedOver === true);
  // ...and when there is no goal to wake, the chat it was asked in is told.
  await tellTheChatItWasAskedIn(req, action, opts.response, outcome);
  return { ok: true, status: newStatus };
}

/**
 * Row 232 — a stopped goal withdraws the introduction it asked for.
 *
 * The seat's 401, with the timestamps: goal 7262 was stopped at 14:36:16
 * („Nothing further will be sent"), and at 14:48 its request 1290 was still
 * `pending`, still in the mediator's `GET /requests` waiting list, its
 * incoming thread still reading „Needs your answer" — and at 14:44:42 the same
 * person was asked the same thing AGAIN, with Yes/No/Later, inside a brand-new
 * goal.
 *
 * An ASK on a stopped goal has been getting its note in four or five seconds
 * since Ticket 6 (`cancelAsksForTask`). An INTRODUCTION asks a bigger favour of
 * the same person and got nothing, because nothing connected the two tables —
 * the same gap `requester_task_id` was added to close for the ANSWER direction
 * and which nobody walked back the other way.
 *
 * Only `pending`: an accepted or declined request is finished, and rewriting a
 * mediator's answered thread to say it was withdrawn would be a lie about what
 * they did. Best-effort throughout — a stop must never fail because a thread
 * could not be written to.
 */
export async function cancelIntroductionRequestsForTask(taskId: number): Promise<number> {
  try {
    const cancelled = await query<{
      id: number;
      mediator_user_id: number | null;
      target_name: string;
    }>(
      /**
       * `responded_at` is deliberately left NULL: NOBODY RESPONDED. The
       * requester withdrew, and stamping a response time would make the row
       * read as answered — `getMyIntroRequests` shows anything resolved in the
       * last few days, and a withdrawal has no business in the list of what
       * came back.
       */
      `UPDATE introduction_requests
       SET status = 'cancelled'
       WHERE requester_task_id = $1 AND status = 'pending'
       RETURNING id, mediator_user_id, target_name`,
      [taskId],
    );
    /**
     * B31, 22 September — BOTH SIDES OF THE WITHDRAWAL, not one.
     *
     * This loop used to `continue` on a null mediator and then skip every
     * thread that was not the mediator's. So the person who stopped the goal
     * kept an outgoing-request chat reading „it has gone to them, they will
     * see it next time they open Netai and reply", with a smiling face, on
     * status „waiting", for good. Requests 1387 and 1453, cancelled 08:38 and
     * 08:52, still saying it at 09:25.
     *
     * A null mediator means there is no INCOMING thread to write — it never
     * meant there was nothing to do, and the requester's own thread exists
     * either way.
     *
     * Each side in ITS OWN owner's language: the two need not share one, and a
     * person let off a favour — or told their request is gone — in a script
     * they cannot read is worse off than one told nothing.
     */
    for (const row of cancelled.rows) {
      const threads = await getThreadsByIntroRequestId(row.id).catch(() => []);
      for (const thread of threads) {
        const isIncoming = thread.type === 'incoming_request';
        if (!isIncoming && thread.type !== 'outgoing_request') continue;
        const owner = String(thread.user_id);
        const language = await userLanguage(owner).catch(() => 'ka' as RunLanguage);
        await saveThreadMessage(
          thread.id,
          thread.user_id,
          'assistant',
          isIncoming
            ? introCancelledNote(language, row.target_name)
            : introWithdrawnByOwnerNote(language, row.target_name),
        ).catch(() => undefined);
        // Row 233's fault, not repeated here: the note and the header have to
        // agree, or „no longer needed" sits under „Needs your answer". Same
        // header on both sides, because it is the same fact about the request.
        await setThreadStatus(owner, thread.id, 'done', {
          statusLine: introCancelledLine(language),
        }).catch(() => undefined);
      }
    }
    return cancelled.rowCount ?? cancelled.rows.length;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(
      `[intro] could not withdraw requests for stopped goal ${taskId}:`,
      (err as Error).message,
    );
    return 0;
  }
}
