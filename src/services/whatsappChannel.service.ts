import { query } from '../db/postgres/client';
import { hasWhatsappConsent } from './whatsappConsent.service';

/**
 * WhatsApp as a second channel (Misho, 25 Oct). Three rules hold everything
 * here:
 *
 *   1. Only for a person who chose it (whatsappConsent) and only while the
 *      switch WHATSAPP_CHANNEL_ON is "true" — sending costs money and reaches
 *      real people, so it is on only by Misho's word.
 *   2. WhatsApp's own rule: free text only inside the 24 hours after the
 *      person last wrote to us; outside it, only an approved template
 *      (WHATSAPP_NOTIFY_TEMPLATE) may open the conversation.
 *   3. Every message, in or out, is recorded without its text, so a reply to
 *      one of ours finds the conversation it belongs to.
 */
const QUERY_TIMEOUT_MS = 4_000;
const GRAPH_URL = 'https://graph.facebook.com/v19.0';
const WINDOW_HOURS = 24;
/** WhatsApp's own limit for a text body. */
const MAX_TEXT_CHARS = 4_096;
/** A template parameter: one line, no tabs, at most 1,024 characters. */
const MAX_TEMPLATE_PARAM_CHARS = 1_000;
const DEFAULT_TEMPLATE_LANGUAGE = 'ka';
/** The device a line typed in WhatsApp is posted from, so its answer is not mirrored back as a notice. */
export const WHATSAPP_DEVICE = 'whatsapp';

export enum WhatsAppDirection {
  In = 'in',
  Out = 'out',
}

export enum WhatsAppKind {
  Text = 'text',
  Template = 'template',
  Reply = 'reply',
}

export function whatsappChannelOn(): boolean {
  return process.env.WHATSAPP_CHANNEL_ON?.trim() === 'true';
}

export async function recordWhatsappMessage(
  userId: number,
  direction: WhatsAppDirection,
  wamid: string | null,
  threadId: number | null,
  kind: WhatsAppKind,
): Promise<boolean> {
  const result = await query(
    `INSERT INTO whatsapp_messages (user_id, direction, wamid, thread_id, kind)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (wamid) DO NOTHING`,
    [userId, direction, wamid, threadId, kind],
    QUERY_TIMEOUT_MS,
  );
  // False when WhatsApp delivered the same message twice: it is handled once.
  return (result.rowCount ?? 0) > 0;
}

/** Has the person written to us in WhatsApp in the last 24 hours? Fails towards no. */
export async function insideWindow(userId: number): Promise<boolean> {
  try {
    const result = await query<{ open: boolean }>(
      `SELECT EXISTS (
         SELECT 1 FROM whatsapp_messages
          WHERE user_id = $1 AND direction = 'in'
            AND created_at > NOW() - make_interval(hours => $2::int)
       ) AS open`,
      [userId, WINDOW_HOURS],
      QUERY_TIMEOUT_MS,
    );
    return result.rows[0]?.open === true;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(`[whatsapp] window of ${userId} not read:`, (err as Error).message);
    return false;
  }
}

/** The conversation one of our messages belonged to, when the person replies to it. */
export async function threadOfOurMessage(userId: number, wamid: string): Promise<number | null> {
  const result = await query<{ thread_id: number | null }>(
    `SELECT thread_id FROM whatsapp_messages
      WHERE user_id = $1 AND wamid = $2 AND direction = 'out'
      LIMIT 1`,
    [userId, wamid],
    QUERY_TIMEOUT_MS,
  );
  return result.rows[0]?.thread_id ?? null;
}

/** The conversation we last wrote to the person about, for a reply that quotes nothing. */
export async function lastThreadWeWroteAbout(userId: number): Promise<number | null> {
  const result = await query<{ thread_id: number | null }>(
    `SELECT thread_id FROM whatsapp_messages
      WHERE user_id = $1 AND direction = 'out' AND thread_id IS NOT NULL
      ORDER BY created_at DESC
      LIMIT 1`,
    [userId],
    QUERY_TIMEOUT_MS,
  );
  return result.rows[0]?.thread_id ?? null;
}

async function phoneOf(userId: number): Promise<string | null> {
  const result = await query<{ phone: string }>(
    `SELECT phone FROM "UserPhone" WHERE "userId" = $1 ORDER BY id LIMIT 1`,
    [userId],
    QUERY_TIMEOUT_MS,
  );
  return result.rows[0]?.phone ?? null;
}

interface GraphSent {
  readonly messages?: ReadonlyArray<{ readonly id?: string }>;
  readonly error?: { readonly message?: string; readonly code?: number };
}

async function postToGraph(payload: object): Promise<string> {
  const phoneId = process.env.WHATSAPP_PHONE_ID;
  const token = process.env.WHATSAPP_TOKEN;
  if (!phoneId || !token) throw new Error('WHATSAPP_PHONE_ID and WHATSAPP_TOKEN are not set');
  const response = await fetch(`${GRAPH_URL}/${phoneId}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: Buffer.from(JSON.stringify({ messaging_product: 'whatsapp', ...payload }), 'utf8'),
  });
  const body = (await response.json()) as GraphSent;
  if (!response.ok) {
    // D149: the provider's complaint, never the number it was for.
    throw new Error(`WhatsApp ${response.status}: ${body.error?.message ?? 'unknown error'}`);
  }
  return body.messages?.[0]?.id ?? '';
}

/** One line a template parameter may carry: WhatsApp refuses newlines, tabs and long gaps. */
export function asTemplateParameter(text: string): string {
  const flat = text
    .replace(/\s*\n+\s*/gu, ' · ')
    .replace(/\t/gu, ' ')
    .replace(/ {4,}/gu, '   ')
    .trim();
  return flat.length > MAX_TEMPLATE_PARAM_CHARS
    ? `${flat.slice(0, MAX_TEMPLATE_PARAM_CHARS - 1)}…`
    : flat;
}

function asTextBody(text: string): string {
  return text.length > MAX_TEXT_CHARS ? `${text.slice(0, MAX_TEXT_CHARS - 1)}…` : text;
}

async function sendText(phone: string, text: string): Promise<string> {
  return postToGraph({
    to: phone.replace(/^\+/u, ''),
    type: 'text',
    text: { body: asTextBody(text), preview_url: true },
  });
}

async function sendNotifyTemplate(phone: string, text: string, template: string): Promise<string> {
  return postToGraph({
    to: phone.replace(/^\+/u, ''),
    type: 'template',
    template: {
      name: template,
      language: {
        code: process.env.WHATSAPP_NOTIFY_TEMPLATE_LANG?.trim() || DEFAULT_TEMPLATE_LANGUAGE,
      },
      components: [
        { type: 'body', parameters: [{ type: 'text', text: asTemplateParameter(text) }] },
      ],
    },
  });
}

export enum WhatsAppOutcome {
  Sent = 'sent',
  Off = 'off',
  NoConsent = 'no_consent',
  NoPhone = 'no_phone',
  NoTemplate = 'no_template',
  Failed = 'failed',
}

/**
 * Netai's message to a person in WhatsApp, if they chose it: as text inside
 * the 24-hour window, as the approved template outside it. Never throws — a
 * WhatsApp failure must not cost the app its own message.
 */
export async function tellInWhatsapp(
  userId: number,
  text: string,
  threadId: number | null,
): Promise<WhatsAppOutcome> {
  if (!whatsappChannelOn()) return WhatsAppOutcome.Off;
  try {
    if (!(await hasWhatsappConsent(userId))) return WhatsAppOutcome.NoConsent;
    const phone = await phoneOf(userId);
    if (phone === null) return WhatsAppOutcome.NoPhone;
    if (await insideWindow(userId)) {
      const wamid = await sendText(phone, text);
      await recordWhatsappMessage(
        userId,
        WhatsAppDirection.Out,
        wamid || null,
        threadId,
        WhatsAppKind.Text,
      );
      return WhatsAppOutcome.Sent;
    }
    const template = process.env.WHATSAPP_NOTIFY_TEMPLATE?.trim();
    if (!template) return WhatsAppOutcome.NoTemplate;
    const wamid = await sendNotifyTemplate(phone, text, template);
    await recordWhatsappMessage(
      userId,
      WhatsAppDirection.Out,
      wamid || null,
      threadId,
      WhatsAppKind.Template,
    );
    return WhatsAppOutcome.Sent;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(`[whatsapp] message to ${userId} not sent:`, (err as Error).message);
    return WhatsAppOutcome.Failed;
  }
}

/** WhatsApp's own limits for reply buttons. */
const MAX_REPLY_BUTTONS = 3;
const MAX_BUTTON_TITLE_CHARS = 20;
const MAX_INTERACTIVE_BODY_CHARS = 1_024;

/** The run's choices as WhatsApp reply buttons, when they fit WhatsApp's limits; else null. */
export function asReplyButtons(choices: readonly string[]): string[] | null {
  const fits =
    choices.length > 0 &&
    choices.length <= MAX_REPLY_BUTTONS &&
    choices.every((c) => c.trim().length > 0 && c.trim().length <= MAX_BUTTON_TITLE_CHARS);
  return fits ? choices.map((c) => c.trim()) : null;
}

async function sendButtons(
  phone: string,
  text: string,
  buttons: readonly string[],
): Promise<string> {
  return postToGraph({
    to: phone.replace(/^\+/u, ''),
    type: 'interactive',
    interactive: {
      type: 'button',
      body: { text: text.slice(0, MAX_INTERACTIVE_BODY_CHARS) },
      action: {
        buttons: buttons.map((title, index) => ({
          type: 'reply',
          reply: { id: `choice_${index}`, title },
        })),
      },
    },
  });
}

/**
 * A reply inside a conversation the person opened from WhatsApp: always inside
 * the window. With choices that fit, they are tappable buttons; otherwise the
 * text already carries them, numbered (see whatsappInbound).
 */
export async function replyInWhatsapp(
  userId: number,
  phone: string,
  text: string,
  threadId: number | null,
  buttons: readonly string[] | null = null,
): Promise<void> {
  const fitsButtons = buttons !== null && text.length <= MAX_INTERACTIVE_BODY_CHARS;
  const wamid = fitsButtons ? await sendButtons(phone, text, buttons) : await sendText(phone, text);
  await recordWhatsappMessage(
    userId,
    WhatsAppDirection.Out,
    wamid || null,
    threadId,
    WhatsAppKind.Reply,
  );
}
