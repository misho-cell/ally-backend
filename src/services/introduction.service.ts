import { query } from '../db/postgres/client';
import { sendPushNotification } from './notification.service';
import { recordProductEvent } from './productEvents.service';
import { setThreadStatus } from './threadStatus.service';
import { getThreadsByIntroRequestId } from './threads.service';

export interface PendingRequest {
  id: number;
  target_name: string;
  message: string | null;
  requester_name: string | null;
  created_at: string;
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

export async function getPendingRequestsForMediator(
  mediatorUserId: string,
): Promise<PendingRequest[]> {
  const result = await query<PendingRequest>(
    `SELECT ir.id, ir.target_name, ir.message, ir.created_at,
            u.name AS requester_name
     FROM introduction_requests ir
     LEFT JOIN "User" u ON u.id = ir.requester_user_id
     WHERE ir.mediator_user_id = $1 AND ir.status = 'pending'
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
            u.name AS requester_name
     FROM introduction_requests ir
     LEFT JOIN "User" u ON u.id = ir.requester_user_id
     WHERE ir.id = $1 AND ir.mediator_user_id = $2 AND ir.status = 'pending'
     LIMIT 1`,
    [requestId, mediatorUserId],
  );
  return result.rows[0] ?? null;
}

export async function getRecentResponsesForRequester(
  requesterUserId: string,
): Promise<RespondedRequest[]> {
  const result = await query<RespondedRequest>(
    `SELECT ir.id, ir.target_name, ir.status, ir.mediator_response, ir.responded_at,
            ir.message, ir.created_at, ir.ask_type,
            m.name AS mediator_name
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
// Requester-side thread caption once the mediator has answered.
const LINE_RESPONSE_ARRIVED = 'პასუხი მოვიდა';
// Mediator-side thread caption while a request is snoozed.
const LINE_SNOOZED = 'გადადებულია';

interface RequestRow {
  id: number;
  request_ref: string;
  requester_user_id: number;
  target_name: string;
  status: string;
}

async function loadRequestForMediator(
  mediatorUserId: string,
  target: { requestId?: number; requestRef?: string },
): Promise<RequestRow | null> {
  const byRef = target.requestRef !== undefined;
  const result = await query<RequestRow>(
    `SELECT id, request_ref, requester_user_id, target_name, status
     FROM introduction_requests
     WHERE mediator_user_id = $1 AND ${byRef ? 'request_ref = $2' : 'id = $2'}
     LIMIT 1`,
    [mediatorUserId, byRef ? target.requestRef : target.requestId],
  );
  return result.rows[0] ?? null;
}

/**
 * Reflect the request's outcome on BOTH of its threads so every device shows
 * the same state: the mediator's incoming thread is settled (or snoozed), the
 * requester's outgoing thread flips to "answer arrived". Best-effort.
 */
async function syncRequestThreads(req: RequestRow, action: IntroductionAction): Promise<void> {
  try {
    const threads = await getThreadsByIntroRequestId(req.id);
    for (const thread of threads) {
      const owner = String(thread.user_id);
      if (thread.type === 'incoming_request') {
        if (action === 'snooze') {
          await setThreadStatus(owner, thread.id, 'waiting', {
            statusLine: LINE_SNOOZED,
            requestRef: req.request_ref,
          });
        } else {
          await setThreadStatus(owner, thread.id, 'done', { requestRef: req.request_ref });
        }
      } else if (thread.type === 'outgoing_request' && action !== 'snooze') {
        await setThreadStatus(owner, thread.id, 'needs_you', {
          statusLine: LINE_RESPONSE_ARRIVED,
          requestRef: req.request_ref,
        });
      }
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(`[intro] thread sync failed for request ${req.id}:`, (err as Error).message);
  }
}

async function notifyRequester(req: RequestRow, accepted: boolean): Promise<void> {
  const body = accepted
    ? `${req.target_name}-ზე გაცნობის მოთხოვნაზე პასუხი მოვიდა. გახსენი Ally.`
    : `${req.target_name}-ზე გაცნობის მოთხოვნაზე უარი მიიღე.`;
  await sendPushNotification(String(req.requester_user_id), {
    title: 'Ally — გაცნობის პასუხი',
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
  opts: { response?: string; snoozeDays?: number; source: ResolveSource },
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
     SET status = $1, mediator_response = $2, responded_at = NOW(), snoozed_until = NULL
     WHERE id = $3 AND status = 'pending'`,
    [newStatus, opts.response ?? null, req.id],
  );
  if ((updated.rowCount ?? 0) === 0) {
    return { ok: false, code: 'conflict', error: ERR_ALREADY_ANSWERED };
  }

  void recordProductEvent(mediatorUserId, 'request_resolved', {
    action,
    source: opts.source,
    request_ref: req.request_ref,
  });
  await notifyRequester(req, action === 'accept');
  await syncRequestThreads(req, action);
  return { ok: true, status: newStatus };
}
