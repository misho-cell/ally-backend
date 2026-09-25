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

/**
 * How long a „yes" keeps a second identical request from going out (item I).
 *
 * Not forever: a year from now the same two people and the same name can be a
 * genuinely new need, and refusing that on the strength of a long-dead
 * introduction would be a worse bug than the one this closes. Thirty days is
 * the span over which asking the same mediator the same thing again is
 * somebody forgetting rather than somebody needing.
 */
const ACCEPTED_STILL_COUNTS_DAYS = 30;

/**
 * After this long with no answer, „already sent" stops being the truth and
 * starts being a dead end (item P). Fourteen days, because a mediator who has
 * not looked in a fortnight is not about to — and it is short enough that the
 * person hears it while the need is still theirs.
 */
export const UNANSWERED_IS_STALE_DAYS = 14;

/**
 * Ticket 20 row 210 — what this request was raised FOR.
 *
 * An options bag rather than a tenth positional parameter: nine is already
 * more than a reader can hold, and the next thing to be threaded through here
 * now has somewhere to go that does not depend on counting commas.
 */
export interface IntroRequestContext {
  /** The requester's open goal, when the conversation had one. */
  requesterTaskId?: number;
  /**
   * The thread this was asked in. Row 210 reopened: without a goal there is
   * nothing to wake, and on 21 September a real person's chat stayed silent
   * through an accept because the outcome had only the request's own thread to
   * go to. Absent over the connector, which has no conversation.
   */
  originThreadId?: number;
}

export async function requestIntroduction(
  requesterUserId: string,
  mediatorName: string,
  targetName: string,
  message?: string,
  mediatorPhone?: string,
  targetUserId?: number,
  targetPhone?: string,
  askType: IntroAskType = 'intro',
  acceptDormant = false,
  context: IntroRequestContext = {},
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
      acceptDormant,
      context,
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
  acceptDormant = false,
  context: IntroRequestContext = {},
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

  // Dormant-twin guard (task 54, founder's yes): an introduction must never
  // be silently aimed at an account that has never been opened — the empty
  // Salome twin would swallow it forever. The model may proceed only after
  // the user explicitly accepts (acceptDormant), and must say so out loud.
  if (!acceptDormant) {
    const activity = await query<{ threads: string }>(
      `SELECT COUNT(*) AS threads FROM threads t WHERE t.user_id = $1`,
      [mediatorUserId],
    );
    if (Number(activity.rows[0]?.threads ?? 0) === 0) {
      return {
        success: false,
        reason: 'dormant_account',
        error:
          `${mediatorName} Netai-ზე რეგისტრირებულია, მაგრამ აპლიკაცია ჯერ არასდროს გაუხსნია — ` +
          'მოთხოვნას ვერ ნახავს, სანამ არ შემოვა. უთხარი ეს მომხმარებელს და ჰკითხე, მაინც ' +
          'გავგზავნო თუ სხვა გზა ვცადოთ; დასტურზე გაიმეორე accept_dormant=true-თი.',
      };
    }
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
  //
  // ⚠️ IT USED TO READ `status = 'pending'` AND NOTHING ELSE — item I, 25
  // September. The moment the mediator ANSWERED, the row stopped being pending
  // and the identical request went out again to somebody who had already said
  // yes. The tester's Test 15 asked Test 16 about Test 17 three times in one
  // day; three separate requests reached Test 16, while `get_intro_status`
  // showed the earlier acceptance the whole time.
  //
  // A guard that only knows „a question is in flight" cannot see „this was
  // already answered", and the second is the one that puts a message on a real
  // person's phone for no reason.
  //
  // An ACCEPT is what is caught here, not a decline. Re-asking after a „no" is
  // a judgement call that can be legitimate when something has changed, and I
  // have no evidence about it; a „yes" that is asked for again is simply a
  // request nobody needed. Bounded by ACCEPTED_STILL_COUNTS_DAYS so that a new
  // need next year is not refused on the strength of a long-dead introduction.
  const dupResult = await query<{ id: number; status: string; days_waiting: number }>(
    isDirect
      ? `SELECT id, status,
                FLOOR(EXTRACT(EPOCH FROM (NOW() - created_at)) / 86400)::int AS days_waiting
           FROM introduction_requests
         WHERE requester_user_id = $1 AND mediator_user_id IS NULL AND target_user_id = $2
           AND (status = 'pending'
                OR (status = 'accepted'
                    AND COALESCE(responded_at, created_at)
                        > NOW() - INTERVAL '${ACCEPTED_STILL_COUNTS_DAYS} days'))
         ORDER BY (status = 'pending') DESC, COALESCE(responded_at, created_at) DESC
         LIMIT 1`
      : `SELECT id, status,
                FLOOR(EXTRACT(EPOCH FROM (NOW() - created_at)) / 86400)::int AS days_waiting
           FROM introduction_requests
         WHERE requester_user_id = $1 AND mediator_user_id = $2 AND target_name = $3
           AND (status = 'pending'
                OR (status = 'accepted'
                    AND COALESCE(responded_at, created_at)
                        > NOW() - INTERVAL '${ACCEPTED_STILL_COUNTS_DAYS} days'))
         ORDER BY (status = 'pending') DESC, COALESCE(responded_at, created_at) DESC
         LIMIT 1`,
    isDirect ? [requesterUserId, mediatorUserId] : [requesterUserId, mediatorUserId, targetName],
  );

  if (dupResult.rows.length > 0) {
    const alreadyAnswered = dupResult.rows[0].status === 'accepted';
    /**
     * ⚠️ „ALREADY SENT" WITHOUT SAYING WHEN — item P, the same afternoon.
     *
     * Sixteen introduction requests on the live base are still `pending`;
     * fourteen of them are older than thirty days and the oldest is from 19
     * June. Nothing ever expires them, so this branch refuses today's request
     * on the strength of one nobody answered a quarter of a year ago — and
     * said only „already sent", which reads as „it is on its way".
     *
     * The requester is then stuck for good: they cannot ask again, and nothing
     * tells them why. The age turns a dead end into something a person can act
     * on — „you asked three months ago and never heard back".
     *
     * THE REFUSAL STILL STANDS. Letting a second request through would put a
     * second card on the mediator's phone, and that is a product decision, not
     * mine. Expiring the sixteen rows is a write across live data and is in
     * `docs/ADMIN_WRITE_OPERATIONS.md` waiting on Misho. What changes here is
     * only what the refusal SAYS, which needs nobody's permission.
     */
    const daysWaiting = Number(dupResult.rows[0].days_waiting ?? 0);
    const longIgnored = !alreadyAnswered && daysWaiting >= UNANSWERED_IS_STALE_DAYS;
    return {
      success: false,
      reason: alreadyAnswered ? 'already_accepted' : 'already_pending',
      days_waiting: daysWaiting,
      error: alreadyAnswered
        ? `${mediatorName} უკვე დათანხმდა ${targetName}-თან დაკავშირებას — ხელახლა თხოვნა ` +
          'მისთვის ზედმეტი შეტყობინებაა. უთხარი მომხმარებელს, რომ თანხმობა უკვე მიღებულია, ' +
          'და ჰკითხე, პირდაპირ დავუკავშირდეთ თუ რამე დასაზუსტებელია. დეტალებისთვის ' +
          'get_intro_status.'
        : longIgnored
          ? `${mediatorName}-სთვის ${targetName}-ზე გაცნობის მოთხოვნა უკვე გაგზავნილია, ` +
            `მაგრამ ${daysWaiting} დღეა უპასუხოდ დგას. ახალს ვერ გავგზავნი. უთხარი ` +
            'მომხმარებელს რამდენი ხანია და ჰკითხე, სხვა შუამავალი ვცადოთ თუ პირდაპირ ' +
            'მიწეროს — ნუ დატოვებ ისე, თითქოს პასუხი გზაშია.'
          : `${mediatorName}-სთვის ${targetName}-ზე გაცნობის მოთხოვნა უკვე გაგზავნილია`,
    };
  }

  const [insertResult, requesterName] = await Promise.all([
    query<{ id: number; request_ref: string }>(
      // Row 210: `requester_task_id` is the goal this was raised for, so the
      // answer can be walked back to it instead of waiting to be asked about.
      `INSERT INTO introduction_requests
         (requester_user_id, mediator_user_id, target_name, message, target_user_id, target_phone, ask_type, requester_task_id, origin_thread_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
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
            context.requesterTaskId ?? null,
            context.originThreadId ?? null,
          ]
        : [
            requesterUserId,
            mediatorUserId,
            targetName,
            message ?? null,
            safeTargetUserId,
            targetPhone ?? null,
            askType,
            context.requesterTaskId ?? null,
            context.originThreadId ?? null,
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
