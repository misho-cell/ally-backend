import { query } from '../../db/postgres/client';
import { sendPushNotification } from '../notification.service';

export async function respondToIntroduction(
  mediatorUserId: string,
  requestId: number,
  accepted: boolean,
  response?: string,
): Promise<object> {
  const reqResult = await query<{
    requester_user_id: string;
    target_name: string;
    status: string;
  }>(
    `SELECT requester_user_id, target_name, status
     FROM introduction_requests
     WHERE id = $1 AND mediator_user_id = $2`,
    [requestId, mediatorUserId],
  );

  if (reqResult.rows.length === 0) {
    return { success: false, error: 'მოთხოვნა ვერ მოიძებნა' };
  }

  const req = reqResult.rows[0];

  if (req.status !== 'pending') {
    return { success: false, error: 'ამ მოთხოვნაზე უკვე გაქვს პასუხი' };
  }

  const status = accepted ? 'accepted' : 'declined';

  await query(
    `UPDATE introduction_requests
     SET status = $1, mediator_response = $2, responded_at = NOW()
     WHERE id = $3`,
    [status, response ?? null, requestId],
  );

  const notifyBody = accepted
    ? `${req.target_name}-ზე გაცნობის მოთხოვნაზე პასუხი მოვიდა. გახსენი Ally.`
    : `${req.target_name}-ზე გაცნობის მოთხოვნაზე უარი მიიღე.`;

  await sendPushNotification(req.requester_user_id, {
    title: 'Ally — გაცნობის პასუხი',
    body: notifyBody,
    url: '/chat',
  });

  return { success: true };
}
