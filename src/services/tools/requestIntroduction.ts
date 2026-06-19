import { query } from '../../db/postgres/client';
import { buildSearchTerms } from './transliterate';
import { sendPushNotification } from '../notification.service';

const CONTACT_SEARCH_LIMIT = 3;

async function findMediatorPhone(
  requesterUserId: string,
  mediatorName: string,
): Promise<{ phone: string; displayName: string | null } | { error: string }> {
  const terms = buildSearchTerms(mediatorName).map((t) => '%' + t + '%');
  const nameCond = terms
    .map((_, i) => `LOWER(ua.alias) LIKE $${i + 2} OR LOWER(u.name) LIKE $${i + 2}`)
    .join(' OR ');

  const result = await query<{ phone: string; display_name: string | null }>(
    `SELECT ua.phone, COALESCE(ua.alias, u.name) AS display_name
     FROM "UserAlias" ua
     LEFT JOIN "UserPhone" up ON up.phone = ua.phone
     LEFT JOIN "User" u ON u.id = up."userId"
     WHERE ua."contactId" = $1 AND (${nameCond})
     LIMIT ${CONTACT_SEARCH_LIMIT}`,
    [requesterUserId, ...terms],
  );

  if (result.rows.length === 0) {
    return { error: `"${mediatorName}" ვერ ვიპოვე შენს კონტაქტებში` };
  }

  if (result.rows.length > 1) {
    const names = result.rows.map((r) => r.display_name ?? r.phone).join(', ');
    return { error: `რამდენიმე ${mediatorName} ვიპოვე: ${names}. გამოიყენე სრული სახელი` };
  }

  return { phone: result.rows[0].phone, displayName: result.rows[0].display_name };
}

async function getRequesterName(userId: string): Promise<string> {
  const result = await query<{ name: string | null }>(
    `SELECT name FROM "User" WHERE id = $1 LIMIT 1`,
    [userId],
  );
  return result.rows[0]?.name ?? 'Ally-ს მომხმარებელი';
}

export async function requestIntroduction(
  requesterUserId: string,
  mediatorName: string,
  targetName: string,
  message?: string,
): Promise<object> {
  const phoneResult = await findMediatorPhone(requesterUserId, mediatorName);
  if ('error' in phoneResult) return { success: false, error: phoneResult.error };

  const { phone: mediatorPhone } = phoneResult;

  const mediatorUserResult = await query<{ userId: string }>(
    `SELECT "userId" FROM "UserPhone" WHERE phone = $1 LIMIT 1`,
    [mediatorPhone],
  );

  if (mediatorUserResult.rows.length === 0) {
    return {
      success: false,
      registered: false,
      error: `${mediatorName} Ally-ს არ იყენებს — მოთხოვნის გაგზავნა შეუძლებელია`,
    };
  }

  const mediatorUserId = mediatorUserResult.rows[0].userId;

  if (mediatorUserId === requesterUserId) {
    return { success: false, error: 'საკუთარ თავზე ვერ გაიგზავნება მოთხოვნა' };
  }

  const pushResult = await query<{ id: number }>(
    `SELECT id FROM push_subscriptions WHERE user_id = $1 LIMIT 1`,
    [mediatorUserId],
  );

  if (pushResult.rows.length === 0) {
    return {
      success: false,
      registered: true,
      no_push: true,
      error: `${mediatorName} Ally-ზე რეგისტრირებულია, მაგრამ ნოტიფიკაციები ჩართული არ აქვს`,
    };
  }

  const dupResult = await query<{ id: number }>(
    `SELECT id FROM introduction_requests
     WHERE requester_user_id = $1 AND mediator_user_id = $2 AND target_name = $3 AND status = 'pending'
     LIMIT 1`,
    [requesterUserId, mediatorUserId, targetName],
  );

  if (dupResult.rows.length > 0) {
    return {
      success: false,
      error: `${mediatorName}-სთვის ${targetName}-ზე გაცნობის მოთხოვნა უკვე გაგზავნილია`,
    };
  }

  const [insertResult, requesterName] = await Promise.all([
    query<{ id: number }>(
      `INSERT INTO introduction_requests (requester_user_id, mediator_user_id, target_name, message)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
      [requesterUserId, mediatorUserId, targetName, message ?? null],
    ),
    getRequesterName(requesterUserId),
  ]);

  const requestId = insertResult.rows[0].id;

  await sendPushNotification(mediatorUserId, {
    title: 'Ally — გაცნობის მოთხოვნა',
    body: `${requesterName} გინდა გეცნოს ${targetName}-ს. გახსენი Ally.`,
    url: '/chat',
  });

  return {
    success: true,
    request_id: requestId,
    message: `მოთხოვნა გაიგზავნა ${mediatorName}-სთვის.`,
  };
}
