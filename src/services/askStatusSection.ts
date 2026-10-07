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
    '\nსერვერი ამ ხაზებს შენი პასუხის ბოლოს თვითონ დაუმატებს — შენ ისინი არ გაიმეორო, ' +
    'არც სხვა სიტყვებით. სანამ ერთი მაინც აქ არის, არასდროს თქვა, რომ „არავინ უპასუხა" ან ' +
    '„პასუხი არ არის" — ეს ხალხი ჯერ კიდევ საქმეშია.'
  );
}

/**
 * #1684, the tester's 41786: the prompt asked for these lines and the reply
 * left them out twice, and once said „ჯერ არცერთს არ უპასუხია" 39 seconds
 * before any ask had gone. So the server does both: a claim that nobody
 * answered goes while it is not true, and the lines are appended.
 */
const NOBODY_ANSWERED_RES: readonly RegExp[] = [
  /(არავინ|არავის|არც\s?ერთს?|არცერთს?)[^.!?\n]{0,40}უპასუხ/u,
  /პასუხი\s+(ჯერ\s+)?(არავის|არავისგან|არ\s+მოსულა)/u,
  /\b(no ?one|nobody|none of them)\b[^.!?\n]{0,30}\b(answered|replied|responded|got back)/iu,
  /\bno (answers?|replies|response)( yet| so far)?\b/iu,
  /(никто|ни один)[^.!?\n]{0,30}(ответил|откликнулся)/iu,
  /(nadie|ninguno)[^.!?\n]{0,30}(respondi|contest)/iu,
];

/** Nobody can truthfully be said to have „not answered" while an ask is still open or none went. */
export function nobodyAnsweredIsUntrue(
  asks: readonly StatedAsk[],
  held: readonly HeldAskStamp[],
  now: Date,
): boolean {
  if (asks.length === 0) return true;
  if (held.length > 0) return true;
  return asks.some((ask) => isOpenAskState(askStateOf(ask, now)));
}

/** Drops each sentence that says nobody answered; the rest of the reply is untouched. */
export function withoutNobodyAnswered(reply: string): string {
  return reply
    .split('\n')
    .map((line) => {
      const sentences = line.match(/[^.!?…]+[.!?…]*\s*/gu) ?? [line];
      const kept = sentences.filter((s) => !NOBODY_ANSWERED_RES.some((re) => re.test(s)));
      return kept.length === sentences.length ? line : kept.join('').trimEnd();
    })
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Appends each per-person line the reply does not already carry. */
export function withAskLines(reply: string, lines: readonly string[]): string {
  const missing = lines.filter((line) => !reply.includes(line));
  if (missing.length === 0) return reply;
  return `${reply.trimEnd()}\n\n${missing.join('\n')}`;
}

/**
 * D714 (the founder, 7 Oct, after his own screen showed „<name>: კითხვა მიუვიდა,
 * პასუხს ველოდები" under a sentence that had just said the same): the lines
 * under a reply are for a goal that asked SEVERAL people — one per person tells
 * who answered and who did not. With one person asked, the reply already says
 * it, and the line goes.
 */
export function peopleAskedOnGoal(
  asks: readonly { readonly to_user_id: number }[],
  held: readonly HeldAskStamp[],
): number {
  return new Set([...asks.map((ask) => ask.to_user_id), ...held.map((row) => row.to_user_id)]).size;
}

export function linesUnderReply(lines: readonly string[], peopleAsked: number): readonly string[] {
  return peopleAsked > 1 ? lines : [];
}
