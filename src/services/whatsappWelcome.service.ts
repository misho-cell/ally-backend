import { query } from '../db/postgres/client';
import {
  WhatsAppDirection,
  WhatsAppKind,
  paidTemplateMayGo,
  phoneOf,
  recordWhatsappMessage,
  sendTemplate,
  welcomeTemplate,
  whatsappChannelOn,
} from './whatsappChannel.service';

/**
 * Misho, 25 Oct (via the frontend): when a person turns WhatsApp on, Netai
 * writes to them there at once, so the conversation is open and can simply be
 * continued. A message Netai starts must be a template Meta approved, so the
 * welcome is one: WELCOME_TEMPLATE (whatsappSetup creates it with the text
 * Misho asked me to write, 25 Oct), or WHATSAPP_WELCOME_TEMPLATE, with no
 * parameters. It goes once per person within WELCOME_REPEAT_DAYS,
 * so flipping the switch does not send a message each time.
 *
 * A choice made while the channel is off sends nothing, then or later: the
 * person's first notice after the channel is on opens the conversation instead.
 */
const QUERY_TIMEOUT_MS = 4_000;
const WELCOME_REPEAT_DAYS = 30;

export enum WelcomeStatus {
  Sent = 'sent',
  ChannelOff = 'channel_off',
  AlreadySent = 'already_sent',
  NoPhone = 'no_phone',
  /** The welcome is a paid template too; it waits while the caps say no. */
  Capped = 'capped',
  Failed = 'failed',
}

async function welcomedRecently(userId: number): Promise<boolean> {
  const result = await query<{ recent: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM whatsapp_consent
        WHERE user_id = $1 AND welcome_sent_at > NOW() - make_interval(days => $2::int)
     ) AS recent`,
    [userId, WELCOME_REPEAT_DAYS],
    QUERY_TIMEOUT_MS,
  );
  return result.rows[0]?.recent === true;
}

async function markWelcomed(userId: number): Promise<void> {
  await query(
    `UPDATE whatsapp_consent SET welcome_sent_at = NOW() WHERE user_id = $1`,
    [userId],
    QUERY_TIMEOUT_MS,
  );
}

/** Sends the welcome to a person who has just turned WhatsApp on. Never throws. */
export async function welcomeInWhatsapp(userId: number): Promise<WelcomeStatus> {
  if (!(await whatsappChannelOn())) return WelcomeStatus.ChannelOff;
  try {
    if (await welcomedRecently(userId)) return WelcomeStatus.AlreadySent;
    const phone = await phoneOf(userId);
    if (phone === null) return WelcomeStatus.NoPhone;
    if (!(await paidTemplateMayGo(userId))) return WelcomeStatus.Capped;
    const wamid = await sendTemplate(phone, welcomeTemplate(), []);
    await markWelcomed(userId);
    await recordWhatsappMessage(
      userId,
      WhatsAppDirection.Out,
      wamid || null,
      null,
      WhatsAppKind.Template,
    );
    return WelcomeStatus.Sent;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(`[whatsapp] welcome to ${userId} not sent:`, (err as Error).message);
    return WelcomeStatus.Failed;
  }
}
