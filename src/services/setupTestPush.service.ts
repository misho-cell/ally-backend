import { query } from '../db/postgres/client';
import { sendPushNotification } from './notification.service';
import { RunLanguage } from './runLanguage';
import { userLanguage } from './threads.service';

/**
 * 1882 step 4: after the person allows notifications, one test push — then
 * „did it arrive?" on the screen. On, on Misho's yes to the exact lines
 * below (BI, §126).
 */
export const TEST_PUSH_ON = true;
const QUERY_TIMEOUT_MS = 5_000;
const SETUP_URL = '/setup';

const TEST_PUSH_TEXT: Readonly<Record<RunLanguage, string>> = {
  ka: 'შეტყობინებები მუშაობს. ასე გაგაგებინებ, როცა ვინმე გიპასუხებს.',
  en: 'Notifications work. This is how I will tell you when someone answers.',
  ru: 'Уведомления работают. Так я сообщу, когда кто-то ответит.',
  es: 'Las notificaciones funcionan. Así te avisaré cuando alguien responda.',
};

export function testPushText(language: RunLanguage): string {
  return TEST_PUSH_TEXT[language] ?? TEST_PUSH_TEXT.ka;
}

export enum TestPushOutcome {
  Off = 'off',
  NoSubscription = 'no_subscription',
  Sent = 'sent',
}

async function hasSubscription(userId: number): Promise<boolean> {
  const result = await query<{ one: number }>(
    `SELECT 1 AS one FROM push_subscriptions WHERE user_id = $1 LIMIT 1`,
    [userId],
    QUERY_TIMEOUT_MS,
  );
  return result.rows.length > 0;
}

export async function sendTestPush(userId: number): Promise<TestPushOutcome> {
  if (!TEST_PUSH_ON) return TestPushOutcome.Off;
  if (!(await hasSubscription(userId))) return TestPushOutcome.NoSubscription;
  const language = await userLanguage(String(userId));
  await sendPushNotification(String(userId), {
    title: 'Netai',
    body: testPushText(language),
    url: SETUP_URL,
  });
  return TestPushOutcome.Sent;
}
