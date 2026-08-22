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
  try {
    return await requestIntroductionInner(
      requesterUserId,
      mediatorName,
      targetName,
      message,
      mediatorPhone,
      targetUserId,
      targetPhone,
      askType,
    );
  } catch (err) {
    // A thrown tool kills the whole model call ("model call failed mid-run —
    // salvaging") and the user gets a salvage artifact instead of an answer —
    // the 22 Aug FK crash surfaced exactly this way. A tool NEVER throws.
    // eslint-disable-next-line no-console
    console.error('[request_introduction] failed:', (err as Error).message);
    return { success: false, error: 'მოთხოვნის შექმნა ვერ მოხერხდა — სცადე თავიდან.' };
  }
}

async function requestIntroductionInner(
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

  // The model's target_user_id is UNTRUSTED — search results carry no user
  // ids, so an invented one violated the FK and killed whole runs (22 Aug).
  // Keep it only when it names a real, live account.
  let safeTargetUserId: number | null = null;
  if (targetUserId !== undefined && Number.isFinite(Number(targetUserId))) {
    const exists = await query<{ id: number }>(
      `SELECT id FROM "User" WHERE id = $1 AND "deletedAt" IS NULL LIMIT 1`,
      [Number(targetUserId)],
    );
    safeTargetUserId = exists.rows[0]?.id ?? null;
  }

  // DIRECT case (task 18): the "mediator" resolves to the TARGET themself —
  // the user wants to meet a member they already hold. Live row #793 stored
  // mediator = target and introduced a person to herself. A direct request
  // stores NO mediator; the target answers it.
  const normalizedDigits = (p: string): string => p.replace(/\D/g, '');
  const isDirect =
    (safeTargetUserId !== null && safeTargetUserId === mediatorUserId) ||
    (targetPhone !== undefined &&
      normalizedDigits(targetPhone) === normalizedDigits(resolvedPhone)) ||
    mediatorName.trim().toLowerCase() === targetName.trim().toLowerCase();

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

  // For a direct request the ANSWERER is the target; the duplicate check and
  // the insert both key on whoever will answer.
  const dupResult = await query<{ id: number }>(
    isDirect
      ? `SELECT id FROM introduction_requests
         WHERE requester_user_id = $1 AND mediator_user_id IS NULL AND target_user_id = $2
           AND status = 'pending'
         LIMIT 1`
      : `SELECT id FROM introduction_requests
         WHERE requester_user_id = $1 AND mediator_user_id = $2 AND target_name = $3 AND status = 'pending'
         LIMIT 1`,
    isDirect ? [requesterUserId, mediatorUserId] : [requesterUserId, mediatorUserId, targetName],
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
      isDirect
        ? [
            requesterUserId,
            null,
            phoneResult.displayName ?? targetName,
            message ?? null,
            mediatorUserId,
            resolvedPhone,
            'direct',
          ]
        : [
            requesterUserId,
            mediatorUserId,
            targetName,
            message ?? null,
            safeTargetUserId,
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
      isDirect,
    ),
    createOutgoingRequestThread(
      Number(requesterUserId),
      requestId,
      mediatorDisplayName,
      targetName,
      isDirect,
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
      body: isDirect
        ? `${requesterName}-ს შენი გაცნობა უნდა. გახსენი Netai.`
        : `${requesterName} გთხოვს, გააცნო ${targetName}-ს. გახსენი Netai.`,
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
