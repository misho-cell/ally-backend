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
     ORDER BY ir.created_at ASC`,
    [mediatorUserId],
  );
  return result.rows;
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
