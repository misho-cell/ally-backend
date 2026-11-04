import { query } from '../db/postgres/client';
import { tellInWhatsapp, whatsappChannelOn } from './whatsappChannel.service';

/**
 * Misho, 25 Oct: every notification a person would get as a push also reaches
 * them in WhatsApp, if they chose it there. Not while they are reading Netai
 * itself.
 *
 * #8713 part 1 (Tornike, 4 Nov; Misho the same day, „ყველა ჩემთან დასმული
 * კითხვა შენი რეკომენდაციებით გააკეთე"): no night mode in WhatsApp — people
 * set their own quiet hours there. A WhatsApp notice goes at any hour; the
 * app's pushes still wait for the morning. What already waits is released by
 * the usual sweep.
 */
const QUERY_TIMEOUT_MS = 4_000;
const APP_URL = 'https://www.netai.guru';
const HELD_RELEASED_PER_SWEEP = 50;
const THREAD_URL_RE = /^\/chat\/(\d+)/u;

export interface MirroredNotice {
  readonly title: string;
  readonly body: string;
  readonly url?: string;
}

/** The conversation a notification opens, when it opens one. */
export function threadOfUrl(url: string | undefined): number | null {
  const match = THREAD_URL_RE.exec(url ?? '');
  return match === null ? null : Number(match[1]);
}

/** What the person reads in WhatsApp: the notification, and the link that opens it in Netai. */
export function whatsappText(notice: MirroredNotice): string {
  const link =
    notice.url !== undefined && notice.url.startsWith('/') ? `\n${APP_URL}${notice.url}` : '';
  const title = notice.title.trim();
  const body = notice.body.trim();
  return `${title === '' || body.startsWith(title) ? '' : `${title}\n`}${body}${link}`;
}

/**
 * The notification in WhatsApp too. `reading`: the person has Netai open, so
 * nothing is sent anywhere else. Never throws.
 */
export async function mirrorToWhatsapp(
  userId: number,
  notice: MirroredNotice,
  reading: boolean,
  highValue = false,
): Promise<void> {
  if (reading || !(await whatsappChannelOn())) return;
  const text = whatsappText(notice);
  const threadId = threadOfUrl(notice.url);
  try {
    await tellInWhatsapp(userId, text, threadId, highValue);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(`[whatsapp] notice for ${userId} not mirrored:`, (err as Error).message);
  }
}

/** Sends what waited for the morning. Returns how many went out. */
export async function releaseHeldWhatsapp(): Promise<number> {
  if (!(await whatsappChannelOn())) return 0;
  const due = await query<{ id: number; user_id: number; text: string; thread_id: number | null }>(
    `UPDATE whatsapp_held SET sent_at = NOW()
      WHERE id IN (SELECT id FROM whatsapp_held
                    WHERE sent_at IS NULL AND release_at <= NOW()
                    ORDER BY release_at LIMIT $1)
      RETURNING id, user_id, text, thread_id`,
    [HELD_RELEASED_PER_SWEEP],
    QUERY_TIMEOUT_MS,
  );
  for (const held of due.rows) {
    await tellInWhatsapp(held.user_id, held.text, held.thread_id);
  }
  return due.rows.length;
}
