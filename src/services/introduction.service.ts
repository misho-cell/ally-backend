import { query } from '../db/postgres/client';

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
     ORDER BY ir.created_at ASC`,
    [mediatorUserId],
  );
  return result.rows;
}

export async function getRecentResponsesForRequester(
  requesterUserId: string,
): Promise<RespondedRequest[]> {
  const result = await query<RespondedRequest>(
    `SELECT id, target_name, status, mediator_response, responded_at
     FROM introduction_requests
     WHERE requester_user_id = $1
       AND status IN ('accepted', 'declined')
       AND responded_at > NOW() - INTERVAL '${RESPONSE_WINDOW_DAYS} days'
     ORDER BY responded_at DESC`,
    [requesterUserId],
  );
  return result.rows;
}
