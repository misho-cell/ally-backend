import Anthropic from '@anthropic-ai/sdk';
import { query } from '../db/postgres/client';
import { recordClaudeUsage } from './costLedger.service';
import { getUserProfile } from './userProfile.service';
import { getPrivateContext } from './userPrivateContext.service';
import { sendPushNotification } from './notification.service';
import { scrubMechanicalForStorage } from './privacyScrub';
import anthropic from '../config/anthropic';
import { ASKED_AS_THE_ASKER_SAVED_THEM } from './savedNameSql';
import { saveServerLine } from './threads.service';
import { emitMessageAppended } from './sse.service';
import { randomUUID } from 'crypto';

/** #1816: where a tap on the engagement push lands — the owner's conversation. */
export const AI_NOTIFICATION_PUSH_URL = '/chat';

const NOTIFICATION_MODEL = 'claude-haiku-4-5-20251001';
const MAX_RECENT_MESSAGES = 12;
const NUDGE_URL_TIMEOUT_MS = 3_000;
const MAX_TOP_CONTACTS = 10;
/** #7921: the people the owner is waiting on, as many as a short push can mention. */
const MAX_WAITING_ON = 8;
const WAITING_ON_DAYS = 14;

// Nudge fatigue: ignoring this many notifications in a row pauses nudges.
const NUDGE_IGNORE_PAUSE_THRESHOLD = 3;
const NUDGE_PAUSE_DAYS = 14;
// How long nudges stay suppressed after the agent flags the user as distressed.
const DISTRESS_PAUSE_DAYS = 7;

interface NotificationContent {
  title: string;
  body: string;
}

interface ContactEntry {
  phone: string;
  tags: string[];
}

interface UserContext {
  profile: Record<string, string>;
  privateContext: Record<string, string>;
  recentMessages: string[];
  topContacts: ContactEntry[];
  pendingMediatorRequests: number;
  /** #7921: who the owner's open asks went to, named as the chat names them. */
  waitingOn: string[];
}

async function gatherUserContext(userId: string): Promise<UserContext> {
  const [profile, privateContext, messagesResult, contactsResult, requestsResult, waitingOn] =
    await Promise.all([
      getUserProfile(userId),
      getPrivateContext(userId),
      query<{ content: string }>(
        `SELECT content FROM conversations
         WHERE user_id = $1 AND role = 'user' AND created_at > NOW() - INTERVAL '7 days'
         ORDER BY created_at DESC LIMIT $2`,
        [userId, MAX_RECENT_MESSAGES],
      ),
      query<{ phone: string; tags: string[] }>(
        `SELECT ut.phone, array_agg(DISTINCT ut.tag) AS tags
         FROM "UserTags" ut
         WHERE ut."contactId" = $1
         GROUP BY ut.phone
         ORDER BY COUNT(*) DESC
         LIMIT $2`,
        [userId, MAX_TOP_CONTACTS],
      ),
      query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM introduction_requests
         WHERE mediator_user_id = $1 AND status = 'pending'`,
        [userId],
      ),
      namesWaitedOn(userId),
    ]);

  return {
    profile,
    privateContext,
    recentMessages: messagesResult.rows.map((r) => r.content),
    topContacts: contactsResult.rows,
    pendingMediatorRequests: Number(requestsResult.rows[0]?.count ?? 0),
    waitingOn,
  };
}

/**
 * #7921 (founder, 26 Oct): a nudge read „ტიკოსა და ერეკლეს პასუხი ელოდება" and
 * misspelled a surname the chat spells right — this model was never given the
 * names, so it shortened them from the owner's own messages. It gets them now,
 * spelled exactly as the chat spells them (the owner's saved name).
 */
async function namesWaitedOn(userId: string): Promise<string[]> {
  const result = await query<{ name: string | null }>(
    `SELECT DISTINCT ${ASKED_AS_THE_ASKER_SAVED_THEM} AS name
       FROM task_asks ta
      WHERE ta.from_user_id = $1::int AND ta.status = 'sent'
        AND ta.created_at > NOW() - make_interval(days => $2)
      LIMIT $3`,
    [userId, WAITING_ON_DAYS, MAX_WAITING_ON],
  );
  return result.rows.map((r) => r.name?.trim() ?? '').filter((n) => n !== '');
}

/**
 * #7921 / #1816: a tap opens the conversation the nudge is about — the goal
 * whose answers the owner is waiting on — or their latest conversation, and
 * only failing both the chat list.
 */
export async function nudgePushUrl(userId: string): Promise<string> {
  try {
    const result = await query<{ thread_id: number }>(
      `SELECT thread_id FROM (
         SELECT k.thread_id, 1 AS rank, ta.created_at AS at
           FROM task_asks ta JOIN tasks k ON k.id = ta.task_id
          WHERE ta.from_user_id = $1::int AND ta.status = 'sent' AND k.thread_id IS NOT NULL
         UNION ALL
         SELECT t.id, 2, t.updated_at FROM threads t WHERE t.user_id::text = $1
       ) c
       ORDER BY rank, at DESC
       LIMIT 1`,
      [userId],
      NUDGE_URL_TIMEOUT_MS,
    );
    const threadId = result.rows[0]?.thread_id;
    return threadId === undefined ? AI_NOTIFICATION_PUSH_URL : `/chat/${threadId}`;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(`[ai-notif] push url for ${userId} not read:`, (err as Error).message);
    return AI_NOTIFICATION_PUSH_URL;
  }
}

/**
 * #8252: the tap opened a chat where the nudge was nowhere. The nudge is now
 * written into the chat its push opens, so the person reads it again there.
 * Never fails the nudge.
 */
async function keepNudgeInItsChat(
  userId: string,
  url: string,
  content: NotificationContent,
): Promise<void> {
  const match = /^\/chat\/(\d+)$/.exec(url);
  if (match === null) return;
  const threadId = Number(match[1]);
  try {
    const saved = await saveServerLine(
      threadId,
      Number(userId),
      `${content.title}\n${content.body}`,
    );
    emitMessageAppended(userId, threadId, randomUUID(), {
      messageId: String(saved.id),
      kind: 'pending',
      content: saved.content,
      choices: [],
      ref: { kind: 'ai_nudge' },
      createdAt: saved.createdAt,
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(`[ai-notif] nudge not kept in chat ${threadId}:`, (err as Error).message);
  }
}

function formatContext(ctx: UserContext): string {
  const parts: string[] = [];

  if (Object.keys(ctx.profile).length > 0) {
    parts.push(
      '## პროფილი\n' +
        Object.entries(ctx.profile)
          .map(([k, v]) => `${k}: ${v}`)
          .join('\n'),
    );
  }

  if (Object.keys(ctx.privateContext).length > 0) {
    parts.push(
      '## მიზნები და გეგმები\n' +
        Object.entries(ctx.privateContext)
          .map(([k, v]) => `${k}: ${v}`)
          .join('\n'),
    );
  }

  if (ctx.recentMessages.length > 0) {
    parts.push('## ბოლო ძიებები\n' + ctx.recentMessages.slice(0, 8).join('\n'));
  }

  if (ctx.topContacts.length > 0) {
    parts.push(
      '## კონტაქტები\n' +
        ctx.topContacts.map((c) => `${c.phone}: ${c.tags.slice(0, 5).join(', ')}`).join('\n'),
    );
  }

  if (ctx.waitingOn.length > 0) {
    parts.push('## ვისაც ახლა პასუხს ელოდება\n' + ctx.waitingOn.join('\n'));
  }

  if (ctx.pendingMediatorRequests > 0) {
    parts.push(`## გაუხსნელი გაცნობის მოთხოვნები: ${ctx.pendingMediatorRequests}`);
  }

  return parts.join('\n\n');
}

/**
 * #8252 (a real member, 28 Oct 09:30 Tbilisi): with little context the old
 * prompt asked for „personal and intriguing" text anyway, and the model
 * invented a referral that never happened, in broken polite Georgian. Now
 * nothing true to say means no nudge: the model answers {"skip": true}.
 */
async function generateNotificationContent(
  userId: string,
  ctx: UserContext,
): Promise<NotificationContent | null> {
  const contextText = formatContext(ctx);

  const response = await anthropic.messages.create({
    model: NOTIFICATION_MODEL,
    max_tokens: 1024,
    system: `შენ აგენერირებ პერსონალიზებულ push notification-ს Netai-სთვის — კონტაქტების ქსელის აპლიკაცია.
მთავარი მიზანი: მომხმარებელი გახსნის app-ს ამ notification-ის გამო.

წესები:
- title: მაქსიმუმ 50 სიმბოლო
- body: მაქსიმუმ 100 სიმბოლო
- დაწერე მხოლოდ ის, რაც კონტექსტში მართლა წერია (კონტაქტი, მიზანი, პასუხის მოლოდინი); არაფერი გამოიგონო
- თუ კონტექსტში კონკრეტული და მართალი არაფერია, გამოიტანე მხოლოდ {"skip": true}
- მიმართე „შენ"-ით, არასოდეს „თქვენ"-ით; მომხმარებელს სახელით ან მეტსახელით ნუ მიმართავ
- მარტივი, გამართული ქართული: ერთი აზრი, მოკლე წინადადებები
- არასოდეს გენერიკულ ტექსტს ("შეამოწმე აპი", "ახალი შეტყობინება")
- ქართულად
- ადამიანი დაასახელე მხოლოდ ისე, როგორც „ვისაც ახლა პასუხს ელოდება" სიაშია — პირველად სრული სახელით და გვარით; არ შეამოკლო და არ შეცვალო მართლწერა; სიაში თუ არაა, სახელს ნუ ახსენებ

გამოიტანე მხოლოდ JSON: {"title": "...", "body": "..."} ან {"skip": true}`,
    messages: [
      {
        role: 'user',
        content:
          contextText.length > 0
            ? `მომხმარებლის კონტექსტი:\n\n${contextText}`
            : 'კონტექსტი ჯერ მწირია.',
      },
      // Prefill the assistant turn with an opening brace so the model is
      // forced to continue raw JSON (no markdown/prose preamble).
      {
        role: 'assistant',
        content: '{',
      },
    ],
  });

  void recordClaudeUsage({
    userId,
    kind: 'notification',
    model: NOTIFICATION_MODEL,
    usage: response.usage,
  }).catch(() => {});

  const rawText = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('');

  // The opening brace lives in the prefill, so prepend it before parsing.
  const text = '{' + rawText;

  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('Claude returned invalid JSON for notification');

  const parsed = JSON.parse(jsonMatch[0]) as { title?: string; body?: string; skip?: boolean };
  if (parsed.skip === true) return null;
  if (!parsed.title || !parsed.body) throw new Error('Notification missing title or body');

  // A phone draws a notification as plain text, so the marks the chat scrub
  // removes would show raw here (tester 1060/1061: the prompt rule is gone).
  return {
    title: scrubMechanicalForStorage(String(parsed.title)),
    body: scrubMechanicalForStorage(String(parsed.body)),
  };
}

async function updateEngagement(userId: string, lastSentAt: Date): Promise<void> {
  const activityResult = await query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM conversations
     WHERE user_id = $1 AND created_at > $2`,
    [userId, lastSentAt],
  );

  const opened = Number(activityResult.rows[0]?.count ?? 0) > 0;

  if (opened) {
    // Re-engaged: clear the ignore counter and any fatigue pause.
    await query(
      `UPDATE ai_notification_settings
       SET consecutive_no_opens = 0,
           frequency_days       = 1,
           paused_until         = NULL,
           updated_at           = NOW()
       WHERE user_id = $1`,
      [userId],
    );
  } else {
    // Ignored again. On the Nth consecutive ignore, pause nudges for 14 days
    // and reset the counter so the user gets a fresh start after the cooldown.
    await query(
      `UPDATE ai_notification_settings
       SET consecutive_no_opens = CASE
             WHEN consecutive_no_opens + 1 >= $2 THEN 0
             ELSE consecutive_no_opens + 1
           END,
           paused_until = CASE
             WHEN consecutive_no_opens + 1 >= $2 THEN NOW() + make_interval(days => $3)
             ELSE paused_until
           END,
           updated_at = NOW()
       WHERE user_id = $1`,
      [userId, NUDGE_IGNORE_PAUSE_THRESHOLD, NUDGE_PAUSE_DAYS],
    );
  }
}

/**
 * Suppress nudges for a user the agent has detected to be in distress.
 * Called from the chat tool layer, not the cron.
 */
export async function setUserDistress(userId: string): Promise<void> {
  await query(
    `INSERT INTO ai_notification_settings (user_id, distress_until)
     VALUES ($1, NOW() + make_interval(days => $2))
     ON CONFLICT (user_id)
     DO UPDATE SET distress_until = EXCLUDED.distress_until, updated_at = NOW()`,
    [userId, DISTRESS_PAUSE_DAYS],
  );
}

/** Clear a distress pause when the user is okay again. */
export async function clearUserDistress(userId: string): Promise<void> {
  await query(
    `UPDATE ai_notification_settings SET distress_until = NULL, updated_at = NOW()
     WHERE user_id = $1`,
    [userId],
  );
}

interface SuppressionState {
  paused: boolean;
  paused_until: Date | null;
  distress_until: Date | null;
}

/** Nudges are suppressed by a legacy hard pause, a fatigue cooldown, or distress. */
function isSuppressed(s: SuppressionState): boolean {
  const now = Date.now();
  if (s.paused) return true;
  if (s.paused_until !== null && new Date(s.paused_until).getTime() > now) return true;
  if (s.distress_until !== null && new Date(s.distress_until).getTime() > now) return true;
  return false;
}

export async function sendAiNotification(userId: string): Promise<void> {
  const settingsResult = await query<{
    frequency_days: number;
    last_sent_at: Date | null;
    paused: boolean;
    paused_until: Date | null;
    distress_until: Date | null;
  }>(
    `SELECT frequency_days, last_sent_at, paused, paused_until, distress_until
     FROM ai_notification_settings
     WHERE user_id = $1`,
    [userId],
  );

  let settings = settingsResult.rows[0];

  if (!settings) {
    await query(
      `INSERT INTO ai_notification_settings (user_id) VALUES ($1) ON CONFLICT DO NOTHING`,
      [userId],
    );
    settings = {
      frequency_days: 1,
      last_sent_at: null,
      paused: false,
      paused_until: null,
      distress_until: null,
    };
  }

  if (isSuppressed(settings)) return;

  if (settings.last_sent_at !== null) {
    const daysSinceLast =
      (Date.now() - new Date(settings.last_sent_at).getTime()) / (1000 * 60 * 60 * 24);
    if (daysSinceLast < settings.frequency_days) return;

    await updateEngagement(userId, new Date(settings.last_sent_at));

    const refreshed = await query<{
      paused: boolean;
      paused_until: Date | null;
      distress_until: Date | null;
    }>(
      `SELECT paused, paused_until, distress_until FROM ai_notification_settings WHERE user_id = $1`,
      [userId],
    );
    if (refreshed.rows[0] && isSuppressed(refreshed.rows[0])) return;
  }

  const ctx = await gatherUserContext(userId);
  const content = await generateNotificationContent(userId, ctx);
  if (content === null) {
    // Nothing true to say today: no push, and not asked again until the next day.
    await query(
      `UPDATE ai_notification_settings SET last_sent_at = NOW(), updated_at = NOW() WHERE user_id = $1`,
      [userId],
    );
    return;
  }

  const logResult = await query<{ id: number }>(
    `INSERT INTO ai_notification_log (user_id, title, body) VALUES ($1, $2, $3) RETURNING id`,
    [userId, content.title, content.body],
  );

  const url = await nudgePushUrl(userId);
  await keepNudgeInItsChat(userId, url, content);
  try {
    // #1816: a tap opens the conversation, like every other push, not wherever the app defaults.
    await sendPushNotification(userId, {
      title: content.title,
      body: content.body,
      url,
    });
    await query(`UPDATE ai_notification_log SET push_sent = true WHERE id = $1`, [
      logResult.rows[0].id,
    ]);
  } catch (err: unknown) {
    // eslint-disable-next-line no-console
    console.error('[ai-notification] push failed:', (err as Error).message);
    // the log entry remains with push_sent = false
  }

  await query(
    `UPDATE ai_notification_settings SET last_sent_at = NOW(), updated_at = NOW() WHERE user_id = $1`,
    [userId],
  );
}

export enum NudgeSeatOutcome {
  BadInput = 'bad_input',
  NotATestSeat = 'not_a_test_seat',
  Ran = 'ran',
}

/** The on-demand run takes a few seats, never a sweep. */
export const MAX_NUDGE_SEATS = 10;
const SEAT_QUERY_TIMEOUT_MS = 4_000;

/**
 * #7921 (box 76722): the nudge, now, for fictional seats the morning walk never
 * reached. Every id must be a test seat; each is written to ai_notification_log
 * as the walk would, and pushed where the seat has a subscription.
 */
export async function runNudgesForSeats(
  seatIds: readonly number[],
): Promise<{ readonly outcome: NudgeSeatOutcome; readonly ran: number }> {
  const unique = [...new Set(seatIds)];
  if (unique.length === 0 || unique.length > MAX_NUDGE_SEATS) {
    return { outcome: NudgeSeatOutcome.BadInput, ran: 0 };
  }
  const seats = await query<{ n: number }>(
    `SELECT COUNT(*)::int AS n FROM test_seats WHERE user_id = ANY($1::int[])`,
    [unique],
    SEAT_QUERY_TIMEOUT_MS,
  );
  if ((seats.rows[0]?.n ?? 0) !== unique.length) {
    return { outcome: NudgeSeatOutcome.NotATestSeat, ran: 0 };
  }
  let ran = 0;
  for (const seatId of unique) {
    try {
      await sendAiNotification(String(seatId));
      ran += 1;
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(`[ai-notif] seat ${seatId}:`, (err as Error).message);
    }
  }
  return { outcome: NudgeSeatOutcome.Ran, ran };
}
