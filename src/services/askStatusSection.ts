import { askStateOf, isOpenAskState, ownerAskLine, AskState, type AskStamps } from './askState';
import type { RunLanguage } from './runLanguage';

/**
 * #1684 (A1): the lines a goal reply ends with — one per person still being
 * waited on, written by the server so „no answer yet" can never be told as
 * „nobody answered" while an ask is still open.
 */

const FALLBACK_NAME: Readonly<Record<RunLanguage, string>> = {
  ka: 'კონტაქტი',
  en: 'Contact',
  ru: 'Контакт',
  es: 'Contacto',
};

export interface StatedAsk extends AskStamps {
  readonly to_user_id: number;
  readonly to_name: string | null;
}

export interface HeldAskStamp {
  readonly to_user_id: number;
  readonly contact_name: string;
  readonly reopens_at: string;
}

/** The newest ask per person decides that person's line. */
function latestPerPerson(asks: readonly StatedAsk[]): StatedAsk[] {
  const byPerson = new Map<number, StatedAsk>();
  for (const ask of asks) byPerson.set(ask.to_user_id, ask);
  return [...byPerson.values()];
}

export function openAskLines(
  asks: readonly StatedAsk[],
  held: readonly HeldAskStamp[],
  language: RunLanguage,
  now: Date,
): string[] {
  const lines: string[] = [];
  const asked = new Set<number>();
  for (const ask of latestPerPerson(asks)) {
    asked.add(ask.to_user_id);
    const state = askStateOf(ask, now);
    if (!isOpenAskState(state)) continue;
    lines.push(ownerAskLine(ask.to_name ?? FALLBACK_NAME[language], ask, state, language));
  }
  for (const row of held) {
    if (asked.has(row.to_user_id)) continue;
    const stamps: AskStamps = { status: 'held', held_until: row.reopens_at };
    lines.push(ownerAskLine(row.contact_name, stamps, AskState.Held, language));
  }
  return lines;
}

/** The prompt section carrying those lines; '' when nobody is being waited on. */
export function askStatusSection(lines: readonly string[]): string {
  if (lines.length === 0) return '';
  return (
    '\n\n## ვის ველოდები — სერვერის ხაზები (#1684)\n' +
    lines.map((line) => `- ${line}`).join('\n') +
    '\nმფლობელისთვის პასუხი ამ ხაზებით დაასრულე, თითო ადამიანზე ერთი, ზუსტად ისე, როგორც აქ წერია ' +
    '(ტირე სიის ნიშანია, ტექსტის ნაწილი არ არის). სანამ ერთი მაინც აქ არის, არასდროს თქვა, ' +
    'რომ „არავინ უპასუხა" ან „პასუხი არ არის" — ეს ხალხი ჯერ კიდევ საქმეშია.'
  );
}
