import { createHmac, timingSafeEqual } from 'crypto';
import jwt from 'jsonwebtoken';
import { query } from '../db/postgres/client';
import { getOrCreateDefaultThread } from './threads.service';
import { ConsentSource, hasWhatsappConsent, setWhatsappConsent } from './whatsappConsent.service';
import {
  WHATSAPP_DEVICE,
  WhatsAppDirection,
  WhatsAppKind,
  lastThreadWeWroteAbout,
  recordWhatsappMessage,
  replyInWhatsapp,
  threadOfOurMessage,
  whatsappChannelOn,
} from './whatsappChannel.service';
import {
  choiceByNumber,
  forgetOwedWhatsappReply,
  oweWhatsappReply,
} from './whatsappReplies.service';

/**
 * Misho, 25 Oct: a person who chose WhatsApp can talk to Netai there as in the
 * app. A message they send is posted into the same conversation through the
 * app's own route — every rule the app applies to a typed line applies here,
 * once, in one place — and the run's answer goes back to them in WhatsApp.
 *
 * Which conversation: the one our message they replied to belonged to; else the
 * one we last wrote to them about; else their main chat.
 */
const QUERY_TIMEOUT_MS = 4_000;
const SIGNATURE_PREFIX = 'sha256=';
const INTERNAL_TOKEN_TTL = '5m';
const STOP_WORDS: ReadonlySet<string> = new Set(['stop', 'სტოპ', 'გამოწერა', 'გაჩერება']);

const LINES = {
  notChosen:
    'Netai-ს აქ გამოსაყენებლად აპში, პროფილში ჩართე „შეტყობინებები ვოთსაფში". მანამდე აქ ვერ გიპასუხებ.',
  stopped: 'კარგი — ვოთსაფში აღარაფერს მოგწერ. ხელახლა ჩართვა აპის პროფილიდან შეგიძლია.',
  failed: 'ახლა ვერ მივიღე შენი შეტყობინება — სცადე ცოტა ხანში ან აპში მომწერე.',
} as const;

/** Verifies WhatsApp's signature over the raw body with the app secret; false when it is not set. */
export function signatureIsValid(rawBody: Buffer, header: string | undefined): boolean {
  const secret = process.env.WHATSAPP_APP_SECRET;
  if (!secret || typeof header !== 'string' || !header.startsWith(SIGNATURE_PREFIX)) return false;
  const expected = createHmac('sha256', secret).update(rawBody).digest();
  const given = Buffer.from(header.slice(SIGNATURE_PREFIX.length), 'hex');
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export interface InboundMessage {
  readonly from: string;
  readonly wamid: string;
  readonly text: string;
  readonly replyTo: string | null;
}

interface RawMessage {
  readonly from?: string;
  readonly id?: string;
  readonly type?: string;
  readonly text?: { readonly body?: string };
  readonly button?: { readonly text?: string };
  readonly interactive?: {
    readonly button_reply?: { readonly title?: string };
    readonly list_reply?: { readonly title?: string };
  };
  readonly context?: { readonly id?: string };
}

function textOf(message: RawMessage): string {
  return (
    message.text?.body ??
    message.interactive?.button_reply?.title ??
    message.interactive?.list_reply?.title ??
    message.button?.text ??
    ''
  ).trim();
}

/** The person's messages in one webhook delivery; statuses and media without text are left out. */
export function inboundMessagesOf(payload: unknown): InboundMessage[] {
  const entries = (payload as { entry?: unknown[] } | null)?.entry ?? [];
  const messages = entries.flatMap((entry) =>
    ((entry as { changes?: unknown[] }).changes ?? []).flatMap(
      (change) =>
        ((change as { value?: { messages?: RawMessage[] } }).value?.messages ?? []) as RawMessage[],
    ),
  );
  return messages
    .map((m) => ({
      from: (m.from ?? '').replace(/\D/gu, ''),
      wamid: m.id ?? '',
      text: textOf(m),
      replyTo: m.context?.id ?? null,
    }))
    .filter((m) => m.from !== '' && m.wamid !== '' && m.text !== '');
}

async function userOfPhone(digits: string): Promise<number | null> {
  const result = await query<{ user_id: number }>(
    `SELECT up."userId" AS user_id FROM "UserPhone" up
       JOIN "User" u ON u.id = up."userId" AND u."deletedAt" IS NULL
      WHERE regexp_replace(up.phone, '\\D', '', 'g') = $1
      ORDER BY up."userId" DESC
      LIMIT 1`,
    [digits],
    QUERY_TIMEOUT_MS,
  );
  return result.rows[0]?.user_id ?? null;
}

// ── One inbound message ──────────────────────────────────────────────────────

async function conversationFor(userId: number, replyTo: string | null): Promise<number> {
  const quoted = replyTo === null ? null : await threadOfOurMessage(userId, replyTo);
  if (quoted !== null) return quoted;
  const last = await lastThreadWeWroteAbout(userId);
  return last ?? (await getOrCreateDefaultThread(String(userId)));
}

/** Posts the line into the conversation through the app's own route, as the person. */
async function postAsTheOwner(userId: number, threadId: number, text: string): Promise<boolean> {
  const secret = process.env.JWT_SECRET ?? '';
  const token = jwt.sign({ userId: String(userId), role: 'user' }, secret, {
    expiresIn: INTERNAL_TOKEN_TTL,
  });
  const port = Number(process.env.PORT ?? 4000);
  const response = await fetch(`http://127.0.0.1:${port}/threads/${threadId}/message`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'x-device-id': WHATSAPP_DEVICE,
    },
    body: JSON.stringify({ message: text }),
  });
  return response.status === 202 || response.status === 200;
}

export async function handleInboundMessage(message: InboundMessage): Promise<void> {
  const userId = await userOfPhone(message.from);
  if (userId === null) return;
  const fresh = await recordWhatsappMessage(
    userId,
    WhatsAppDirection.In,
    message.wamid,
    null,
    WhatsAppKind.Text,
  );
  if (!fresh) return;
  if (STOP_WORDS.has(message.text.toLowerCase())) {
    await setWhatsappConsent(userId, false, ConsentSource.WhatsAppStop);
    await replyInWhatsapp(userId, message.from, LINES.stopped, null);
    return;
  }
  if (!(await hasWhatsappConsent(userId))) {
    await replyInWhatsapp(userId, message.from, LINES.notChosen, null);
    return;
  }
  const threadId = await conversationFor(userId, message.replyTo);
  oweWhatsappReply(userId, threadId, message.from);
  const text = choiceByNumber(userId, message.text);
  if (!(await postAsTheOwner(userId, threadId, text))) {
    forgetOwedWhatsappReply(userId, threadId);
    await replyInWhatsapp(userId, message.from, LINES.failed, threadId);
  }
}

/** Every message of one webhook delivery, one after another. Never throws. */
export async function handleWhatsappWebhook(payload: unknown): Promise<void> {
  if (!(await whatsappChannelOn())) return;
  for (const message of inboundMessagesOf(payload)) {
    try {
      await handleInboundMessage(message);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[whatsapp] inbound message not handled:', (err as Error).message);
    }
  }
}
