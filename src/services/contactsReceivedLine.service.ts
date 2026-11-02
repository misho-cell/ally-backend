import { randomUUID } from 'crypto';
import { sendPushNotification } from './notification.service';
import { recordProductEvent } from './productEvents.service';
import { isQuietHour } from './pushQuietHours';
import { RunLanguage } from './runLanguage';
import { emitMessageAppended } from './sse.service';
import { getOrCreateDefaultThread, saveServerLine, userLanguage } from './threads.service';

/**
 * Misho, 2 Nov (a real joiner's upload): the contacts loaded in the background
 * and Netai said nothing, so the member could not tell the upload had worked.
 * When a link upload has saved its contacts, the member reads one line in
 * their main chat. New server text real people read, under the 26 Oct rule.
 */
export const CONTACTS_RECEIVED_EVENT = 'contacts_received_line';
const DAY_ZONE = 'Asia/Tbilisi';

export const CONTACTS_RECEIVED_LINE: Readonly<Record<RunLanguage, string>> = {
  ka: 'კონტაქტები მივიღე. ახლა შენს წრეში შემიძლია ძებნა — მითხარი, ვინ ან რა გჭირდება.',
  en: 'I have your contacts. I can search your circle now — tell me who or what you need.',
  ru: 'Контакты получены. Теперь я могу искать в твоём круге — скажи, кто или что тебе нужно.',
  es: 'Tengo tus contactos. Ya puedo buscar en tu círculo: dime a quién o qué necesitas.',
};

/** The line in the member's main chat; the push only outside quiet hours. Recorded first. */
export async function tellContactsReceived(userId: number, now: Date = new Date()): Promise<void> {
  const owner = String(userId);
  const threadId = await getOrCreateDefaultThread(owner);
  await recordProductEvent(userId, CONTACTS_RECEIVED_EVENT, { thread_id: threadId });
  const language = await userLanguage(owner).catch(() => 'ka' as RunLanguage);
  const line = CONTACTS_RECEIVED_LINE[language] ?? CONTACTS_RECEIVED_LINE.ka;
  const saved = await saveServerLine(threadId, userId, line);
  emitMessageAppended(owner, threadId, randomUUID(), {
    messageId: String(saved.id),
    kind: 'pending',
    content: saved.content,
    choices: [],
    ref: { kind: CONTACTS_RECEIVED_EVENT },
    createdAt: saved.createdAt,
  });
  if (isQuietHour(now, DAY_ZONE)) return;
  void sendPushNotification(owner, { title: 'Netai', body: line, url: `/chat/${threadId}` }).catch(
    () => undefined,
  );
}
