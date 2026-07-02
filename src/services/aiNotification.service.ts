import Anthropic from '@anthropic-ai/sdk';
import { query } from '../db/postgres/client';
import { recordClaudeUsage } from './costLedger.service';
import { getUserProfile } from './userProfile.service';
import { getPrivateContext } from './userPrivateContext.service';
import { sendPushNotification } from './notification.service';
import anthropic from '../config/anthropic';

const NOTIFICATION_MODEL = 'claude-haiku-4-5-20251001';
const MAX_RECENT_MESSAGES = 12;
const MAX_TOP_CONTACTS = 10;

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
}

async function gatherUserContext(userId: string): Promise<UserContext> {
  const [profile, privateContext, messagesResult, contactsResult, requestsResult] =
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
    ]);

  return {
    profile,
    privateContext,
    recentMessages: messagesResult.rows.map((r) => r.content),
    topContacts: contactsResult.rows,
    pendingMediatorRequests: Number(requestsResult.rows[0]?.count ?? 0),
  };
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

  if (ctx.pendingMediatorRequests > 0) {
    parts.push(`## გაუხსნელი გაცნობის მოთხოვნები: ${ctx.pendingMediatorRequests}`);
  }

  return parts.join('\n\n');
}

async function generateNotificationContent(
  userId: string,
  ctx: UserContext,
): Promise<NotificationContent> {
  const contextText = formatContext(ctx);

  const response = await anthropic.messages.create({
    model: NOTIFICATION_MODEL,
    max_tokens: 1024,
    system: `შენ აგენერირებ პერსონალიზებულ push notification-ს Ally-სთვის — კონტაქტების ქსელის აპლიკაცია.
მთავარი მიზანი: მომხმარებელი გახსნის app-ს ამ notification-ის გამო.

წესები:
- title: მაქსიმუმ 50 სიმბოლო
- body: მაქსიმუმ 100 სიმბოლო
- თუ კონკრეტული კონტენტი გაქვს (კონტაქტი, მიზანი, შესაძლებლობა) — გამოიყენე
- თუ კონტენტი მწირია — მაინც პირადი და ინტრიგული ტექსტი დაწერე, რომ მოინდომოს შემოსვლა
- არასოდეს გენერიკულ ტექსტს ("შეამოწმე აპი", "ახალი შეტყობინება")
- ქართულად

გამოიტანე მხოლოდ JSON: {"title": "...", "body": "..."}`,
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

  const parsed = JSON.parse(jsonMatch[0]) as { title?: string; body?: string };
  if (!parsed.title || !parsed.body) throw new Error('Notification missing title or body');

  return { title: String(parsed.title), body: String(parsed.body) };
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

  const logResult = await query<{ id: number }>(
    `INSERT INTO ai_notification_log (user_id, title, body) VALUES ($1, $2, $3) RETURNING id`,
    [userId, content.title, content.body],
  );

  try {
    await sendPushNotification(userId, { title: content.title, body: content.body });
    await query(`UPDATE ai_notification_log SET push_sent = true WHERE id = $1`, [
      logResult.rows[0].id,
    ]);
  } catch {
    // push failed — log entry remains with push_sent = false
  }

  await query(
    `UPDATE ai_notification_settings SET last_sent_at = NOW(), updated_at = NOW() WHERE user_id = $1`,
    [userId],
  );
}
