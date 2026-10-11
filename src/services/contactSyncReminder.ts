import { RunLanguage } from './runLanguage';

/**
 * BH (§128, Misho's „ყველა კი", 11 Oct; the frontend's 06:30Z item 7): once a
 * month, a person who turned the reminder on and whose last import is over 30
 * days old is rung once, at noon on their own device's clock, to sync their
 * contacts again. The texts are the ones approved in NIGHT_QUESTIONS BH.
 */
export const SYNC_REMINDER_DAYS = 30;
export const SYNC_REMINDER_LOCAL_HOUR = 12;
/** The page with the sync switch and the import. */
export const SYNC_REMINDER_URL = '/profile';

const SYNC_REMINDER: Readonly<
  Record<RunLanguage, { readonly title: string; readonly body: string }>
> = {
  ka: {
    title: 'Netai',
    body: 'ერთი თვე გავიდა მას შემდეგ, რაც კონტაქტები ბოლოს გაანახლე. განაახლე, რომ ახალი ნაცნობებიც შენს ქსელში იყვნენ.',
  },
  en: {
    title: 'Netai',
    body: 'It has been a month since you last synced your contacts. Sync again so the people you met since are in your network too.',
  },
  ru: {
    title: 'Netai',
    body: 'Прошёл месяц с последней синхронизации контактов. Обнови их, чтобы новые знакомые тоже были в твоей сети.',
  },
  es: {
    title: 'Netai',
    body: 'Ha pasado un mes desde que sincronizaste tus contactos. Vuelve a hacerlo para que la gente que conociste esté en tu red.',
  },
};

export interface SyncReminderPush {
  readonly title: string;
  readonly body: string;
  readonly url: string;
}

/** The push, in the person's language (Georgian when there is no line for it). */
export function syncReminderPush(language: RunLanguage): SyncReminderPush {
  const text = SYNC_REMINDER[language] ?? SYNC_REMINDER.ka;
  return { ...text, url: SYNC_REMINDER_URL };
}
