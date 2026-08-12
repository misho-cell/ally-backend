import { query } from '../../db/postgres/client';
import { buildSearchTerms } from './transliterate';
import { sendPushNotification } from '../notification.service';
import { createIncomingRequestThread, createOutgoingRequestThread } from '../threads.service';
import { emitThreadCreated } from '../sse.service';
import { isOptedOutFromAsks } from '../askOptOut.service';
import { isPhoneOptedOut } from '../privacyRights.service';

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
  return result.rows[0]?.name ?? 'Netai-ს მომხმარებელი';
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

export type IntroAskType = 'intro' | 'share_contact';

export async function requestIntroduction(
  requesterUserId: string,
  mediatorName: string,
  targetName: string,
  message?: string,
  mediatorPhone?: string,
  targetUserId?: number,
  targetPhone?: string,
  askType: IntroAskType = 'intro',
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
      error: `${mediatorName} Netai-ს არ იყენებს — მოთხოვნის გაგზავნა შეუძლებელია`,
    };
  }

  const mediatorUserId = mediatorUserResult.rows[0].userId;

  if (String(mediatorUserId) === requesterUserId) {
    return { success: false, error: 'საკუთარ თავზე ვერ გაიგზავნება მოთხოვნა' };
  }

  // Person-level opt-out covers EVERY path that puts a message on someone's
  // phone — ticket 4 PART B miss 1: an intro request reached an opted-out
  // recipient because only createAsk enforced the stop. Same rule, same
  // wording contract: the asker hears the truth, never a technical excuse.
  if ((await isOptedOutFromAsks(mediatorUserId)) || (await isPhoneOptedOut(resolvedPhone))) {
    return {
      success: false,
      error:
        `${mediatorName}-მ მოითხოვა, რომ Netai-დან შეტყობინებები აღარ მიეღო — ამიტომ მას ვერც ` +
        'გაცნობის მოთხოვნას ვუგზავნით. ეს მისი გადაწყვეტილებაა და პატივს ვცემთ. მომხმარებელს ' +
        'პირდაპირ უთხარი ეს და შესთავაზე სხვა შუამავალი.',
    };
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
    query<{ id: number; request_ref: string }>(
      `INSERT INTO introduction_requests
         (requester_user_id, mediator_user_id, target_name, message, target_user_id, target_phone, ask_type)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, request_ref`,
      [
        requesterUserId,
        mediatorUserId,
        targetName,
        message ?? null,
        targetUserId ?? null,
        targetPhone ?? null,
        askType,
      ],
    ),
    getRequesterName(requesterUserId),
  ]);

  const requestId = insertResult.rows[0].id;
  const requestRef = insertResult.rows[0].request_ref;

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
    is_task: incomingThread.is_task,
    status: incomingThread.status,
    status_line: incomingThread.status_line,
    request_ref: requestRef,
  });
  emitThreadCreated(requesterUserId, {
    id: outgoingThread.id,
    type: outgoingThread.type,
    title: outgoingThread.title,
    is_task: outgoingThread.is_task,
    status: outgoingThread.status,
    status_line: outgoingThread.status_line,
    request_ref: requestRef,
  });

  if (hasPush) {
    await sendPushNotification(String(mediatorUserId), {
      title: 'Netai — გაცნობის მოთხოვნა',
      body: `${requesterName} გინდა გეცნოს ${targetName}-ს. გახსენი Netai.`,
      url: '/chat',
    });
  }

  return {
    success: true,
    request_id: requestId,
    push_sent: hasPush,
    message: hasPush
      ? `მოთხოვნა გაიგზავნა ${mediatorName}-სთვის.`
      : `მოთხოვნა შეიქმნა. ${mediatorName}-ს ნოტიფიკაციები არ აქვს ჩართული — დაინახავს Netai-ს გახსნისას.`,
  };
}
