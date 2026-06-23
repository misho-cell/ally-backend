import { query } from '../../db/postgres/client';
import { buildSearchTerms } from './transliterate';
import { sendPushNotification } from '../notification.service';
import { createIncomingRequestThread, createOutgoingRequestThread } from '../threads.service';
import { emitThreadCreated } from '../sse.service';

const CONTACT_SEARCH_LIMIT = 3;

export interface DisambiguationCandidate {
  phone: string;
  name: string;
}

type PhoneResult =
  | { phone: string; displayName: string | null }
  | { error: string }
  | { needs_disambiguation: true; candidates: DisambiguationCandidate[] };

async function findMediatorPhone(
  requesterUserId: string,
  mediatorName: string,
): Promise<PhoneResult> {
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
    return {
      needs_disambiguation: true,
      candidates: result.rows.map((r) => ({ phone: r.phone, name: r.display_name ?? r.phone })),
    };
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

async function findMediatorPhoneByPhone(
  requesterUserId: string,
  phone: string,
): Promise<PhoneResult> {
  const result = await query<{ phone: string; display_name: string | null }>(
    `SELECT ua.phone, COALESCE(ua.alias, u.name) AS display_name
     FROM "UserAlias" ua
     LEFT JOIN "UserPhone" up ON up.phone = ua.phone
     LEFT JOIN "User" u ON u.id = up."userId"
     WHERE ua."contactId" = $1 AND ua.phone = $2
     LIMIT 1`,
    [requesterUserId, phone],
  );

  if (result.rows.length === 0) {
    return { error: `${phone} შენს კონტაქტებში ვერ ვიპოვე` };
  }

  return { phone: result.rows[0].phone, displayName: result.rows[0].display_name };
}

export async function requestIntroduction(
  requesterUserId: string,
  mediatorName: string,
  targetName: string,
  message?: string,
  mediatorPhone?: string,
  targetUserId?: number,
  targetPhone?: string,
): Promise<object> {
  const phoneResult = mediatorPhone
    ? await findMediatorPhoneByPhone(requesterUserId, mediatorPhone)
    : await findMediatorPhone(requesterUserId, mediatorName);

  if ('error' in phoneResult) return { success: false, error: phoneResult.error };
  if ('needs_disambiguation' in phoneResult) return phoneResult;

  const resolvedPhone = phoneResult.phone;

  const mediatorUserResult = await query<{ userId: number }>(
    `SELECT "userId" FROM "UserPhone" WHERE phone = $1 LIMIT 1`,
    [resolvedPhone],
  );

  if (mediatorUserResult.rows.length === 0) {
    return {
      success: false,
      registered: false,
      error: `${mediatorName} Ally-ს არ იყენებს — მოთხოვნის გაგზავნა შეუძლებელია`,
    };
  }

  const mediatorUserId = mediatorUserResult.rows[0].userId;

  if (String(mediatorUserId) === requesterUserId) {
    return { success: false, error: 'საკუთარ თავზე ვერ გაიგზავნება მოთხოვნა' };
  }

  const hasPush =
    (
      await query<{ id: number }>(`SELECT id FROM push_subscriptions WHERE user_id = $1 LIMIT 1`, [
        mediatorUserId,
      ])
    ).rows.length > 0;

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
      `INSERT INTO introduction_requests
         (requester_user_id, mediator_user_id, target_name, message, target_user_id, target_phone)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      [
        requesterUserId,
        mediatorUserId,
        targetName,
        message ?? null,
        targetUserId ?? null,
        targetPhone ?? null,
      ],
    ),
    getRequesterName(requesterUserId),
  ]);

  const requestId = insertResult.rows[0].id;

  const mediatorDisplayName = phoneResult.displayName ?? mediatorName;

  const [incomingThread, outgoingThread] = await Promise.all([
    createIncomingRequestThread(
      mediatorUserId,
      requestId,
      requesterName,
      targetName,
      message ?? null,
    ),
    createOutgoingRequestThread(
      Number(requesterUserId),
      requestId,
      mediatorDisplayName,
      targetName,
    ),
  ]);

  emitThreadCreated(String(mediatorUserId), {
    id: incomingThread.id,
    type: incomingThread.type,
    title: incomingThread.title,
  });
  emitThreadCreated(requesterUserId, {
    id: outgoingThread.id,
    type: outgoingThread.type,
    title: outgoingThread.title,
  });

  if (hasPush) {
    await sendPushNotification(String(mediatorUserId), {
      title: 'Ally — გაცნობის მოთხოვნა',
      body: `${requesterName} გინდა გეცნოს ${targetName}-ს. გახსენი Ally.`,
      url: '/chat',
    });
  }

  return {
    success: true,
    request_id: requestId,
    push_sent: hasPush,
    message: hasPush
      ? `მოთხოვნა გაიგზავნა ${mediatorName}-სთვის.`
      : `მოთხოვნა შეიქმნა. ${mediatorName}-ს ნოტიფიკაციები არ აქვს ჩართული — დაინახავს Ally-ს გახსნისას.`,
  };
}
