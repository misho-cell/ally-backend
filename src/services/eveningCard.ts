import { nextLocalMinute } from './pushQuietHours';
import type { RunLanguage } from './runLanguage';

/**
 * #1850 (founder, 6 Oct): the two questions a day that reach a person at once
 * stay; everything else that arrived for them is shown ONCE, as one card, at
 * 19:00 their own time — „a human assistant calls you twice during the day,
 * and in the evening comes into your office with all the other points". The
 * card has ONE snooze for all its items; it comes back about two hours later.
 *
 * Pure: the times and the words. The reads and writes are in
 * eveningCard.service.ts.
 */
const MINUTES_PER_HOUR = 60;
export const EVENING_CARD_HOUR = 19;
export const EVENING_CARD_MINUTE = EVENING_CARD_HOUR * MINUTES_PER_HOUR;
export const EVENING_CARD_SNOOZE_MS = 2 * MINUTES_PER_HOUR * 60_000;

/** When the person's next card is due, and the local day it belongs to. */
export function nextEveningCard(
  now: Date,
  zone: string,
): { readonly dueAt: Date; readonly cardDate: string } {
  const next = nextLocalMinute(now, zone, EVENING_CARD_MINUTE);
  return { dueAt: next.at, cardDate: next.localDate };
}

/** The one push that says the card is here. */
export function eveningCardPush(
  language: RunLanguage,
  items: number,
): { readonly title: string; readonly body: string } {
  switch (language) {
    case 'en':
      return { title: 'Your evening card', body: `${items} questions from today, in one place.` };
    case 'ru':
      return {
        title: 'Вечерняя карточка',
        body: `Вопросов за день: ${items} — все в одном месте.`,
      };
    case 'es':
      return {
        title: 'Tu tarjeta de la tarde',
        body: `${items} preguntas de hoy, en un solo lugar.`,
      };
    default:
      return { title: 'საღამოს ბარათი', body: `დღის ${items} კითხვა ერთ ადგილას.` };
  }
}

/** What the asker's run is told when a question goes onto the card. No hour, no „today" (D563). */
export function heldForEveningCardNote(toName: string): string {
  return (
    `${toName}-ს ბოლო 24 საათში ახალი კითხვების ზღვარი უკვე შეევსო, ამიტომ ეს კითხვა ` +
    'მის საღამოს ბარათში ჩაიდო — დღის დანარჩენ კითხვებთან ერთად ერთხელ ნახავს და თითოეულს ' +
    'ერთი შეხებით უპასუხებს. ხელახლა არ გაგზავნო. მფლობელს ერთი ხაზით უთხარი: კითხვა ' +
    `${toName}-ს საღამოს ბარათში ჩავდე, ამ დღის სხვა კითხვებთან ერთად ნახავს. საათი არ ახსენო.`
  );
}
