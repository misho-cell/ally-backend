import { randomUUID } from 'crypto';
import { query } from '../db/postgres/client';
import { buttonToldByNetai, yesIsToldAtTheTap } from './askOpening';
import { nameToSay } from './spokenName';
import { relayedForReader, RelayedKind } from './askTranslation.service';
import { geoName } from './georgianCase';
import { detectRunLanguage, RunLanguage } from './runLanguage';
import { emitMessageAppended } from './sse.service';
import { saveServerLine, threadLanguage } from './threads.service';
import { georgianFirstName, georgianNamesFor } from './georgianScriptName';
import { registeredName } from './serverGreeting';

/**
 * ROW 322(a) — THE ANSWERS REACH THE OWNER'S SCREEN BEFORE THE MODEL SPEAKS.
 *
 * The split measured on the seat's goal 11155: the server hands an answer over
 * in about five seconds; the recipients' own runs take nine to thirteen; and
 * the owner's model turn took fifty-nine. For that last minute the owner was
 * looking at nothing while words somebody had sent them sat in a table.
 *
 * So the server writes them itself, the moment it reads them: one card in the
 * goal thread, each answer under the name of who gave it, in the owner's
 * language. The model's reply follows and is told the card is already there,
 * so it says what the answers MEAN rather than reading them out a second time.
 *
 * Quotation marks only on a person's own words (row 303). A translation is
 * never in quotes — it is ours — and their original stays beside it.
 */

const SHOWN_QUERY_TIMEOUT_MS = 5_000;

export interface CardAnswer {
  readonly askId: number;
  readonly answer: string;
  readonly fromName: string | null;
  /** Row 303: the text is the answerer's own words. */
  readonly verbatim: boolean;
  /** The bridge who passed the question on (D254), when the answer came through one. */
  readonly viaName?: string | null;
}

export interface AnswerCardTarget {
  readonly threadId: number;
  readonly ownerId: number;
}

const HEADING: Readonly<Record<RunLanguage, { one: string; many: string }>> = {
  en: { one: 'An answer came in:', many: 'Answers came in:' },
  ru: { one: 'Пришёл ответ:', many: 'Пришли ответы:' },
  es: { one: 'Llegó una respuesta:', many: 'Llegaron respuestas:' },
  ka: { one: 'მოვიდა პასუხი:', many: 'მოვიდა პასუხები:' },
};

/** „(through Levan)" without inflecting the name: the label comes first. */
const VIA: Readonly<Record<RunLanguage, string>> = {
  en: 'via',
  ru: 'через',
  es: 'a través de',
  ka: 'შუამავალი:',
};

const SOMEBODY: Readonly<Record<RunLanguage, string>> = {
  en: 'Someone you asked',
  ru: 'Тот, кого вы спросили',
  es: 'Alguien a quien preguntaste',
  ka: 'ადამიანი, ვისაც ჰკითხე',
};

/** 5149 C (D583, Giorgi): an answer is brought by the person's assistant, and the line says so. */
const ASSISTANT_OF: Readonly<Record<RunLanguage, (name: string) => string>> = {
  ka: (name) => `${geoName(name, 'gen')} ასისტენტი`,
  en: (name) => `${name}'s assistant`,
  ru: (name) => `Ассистент ${name}`,
  es: (name) => `El asistente de ${name}`,
};

/**
 * #6007 (QA-006): a tapped button is retold in Netai's words — „სანდრო ამაში
 * ვერ დაგეხმარება", not the helper's „ამაში ვერ დაგეხმარები". Null for words
 * that are not one of our buttons.
 */
function buttonLine(answer: CardAnswer, language: RunLanguage, who: string): string | null {
  const from = answer.fromName?.trim();
  const name = from ? nameToSay(from, language) : SOMEBODY[language];
  const retold = buttonToldByNetai(answer.answer, language, name);
  if (retold === null) return null;
  return from ? `${who}: ${retold}` : retold;
}

/**
 * #8154 (tester, v19 round; Misho, 30 Oct: yes on the recommendation): every
 * answer on the card is retold for the owner — third person singular, in the
 * owner's language, even when both write it. Tester 79135 (8/10): two lines
 * not marked as the helper's own words were only translated, so the helper's
 * formal „თუ გაინტერესებთ" and quoted speech stood, and an English line that
 * did not translate went in after „მითხრა, რომ".
 */
const CARD_RELAY: RelayedKind = 'retold_answer';

/** Not retold: the words go in quotes when they are the helper's own or in another language. */
function quotedWhenNotRetold(answer: CardAnswer, language: RunLanguage): boolean {
  return answer.verbatim || detectRunLanguage(answer.answer) !== language;
}

/**
 * The helper's own words under a translation, in quotes. Not under a retelling
 * in the same language: there the line already says it, in the owner's words.
 */
function originalUnder(answer: CardAnswer, original: string, language: RunLanguage): string {
  if (!answer.verbatim || detectRunLanguage(original) === language) return '';
  return `\n(„${original.trim()}")`;
}

/** One answer's line: their own words in quotes, anything else without. */
async function cardLine(answer: CardAnswer, language: RunLanguage): Promise<string> {
  const via = answer.viaName?.trim();
  const from = answer.fromName?.trim();
  const sender = from ? ASSISTANT_OF[language](from) : SOMEBODY[language];
  const who = `${sender}${via ? ` (${VIA[language]} ${via})` : ''}`;
  const button = buttonLine(answer, language, who);
  if (button !== null) return button;
  const relayed = await relayedForReader(answer.answer, language, CARD_RELAY);
  if (relayed.original === undefined) {
    return quotedWhenNotRetold(answer, language)
      ? `${who}: „${answer.answer.trim()}"`
      : `${who}: ${answer.answer.trim()}`;
  }
  const original = originalUnder(answer, relayed.original, language);
  return `${who}: ${relayed.text.trim()}${original}`;
}

/**
 * #6353 (Giorgi's wording, Misho's yes 20 Oct): in Georgian the card is
 * Netai telling the owner what it heard — „<owner>, ვესაუბრე <H>-ს ასისტენტს
 * და მითხრა, რომ …" — with no „მოვიდა პასუხი:" heading, no „Ally", and the
 * helper's first name in Georgian script. Their own words stay in quotes.
 */
export interface GeorgianCardNames {
  /** The owner's first name, as the card opens with it; null when unknown. */
  readonly ownerFirst: string | null;
  /** Each saved label as a Georgian line writes it. */
  readonly shown: ReadonlyMap<string, string>;
}

const KA_VIA = 'შუამავალი:';

async function georgianCardLine(answer: CardAnswer, names: GeorgianCardNames): Promise<string> {
  const from = answer.fromName?.trim();
  if (!from) return cardLine(answer, 'ka');
  const helper = georgianFirstName(names.shown.get(from) ?? from);
  const via = answer.viaName?.trim();
  const viaNote = via ? ` (${KA_VIA} ${names.shown.get(via) ?? via})` : '';
  const spoke = `ვესაუბრე ${geoName(helper, 'gen')} ასისტენტს${viaNote} და მითხრა`;
  const retold = buttonToldByNetai(answer.answer, 'ka', nameToSay(helper, 'ka'));
  if (retold !== null) return `${spoke}, რომ ${retold}`;
  const relayed = await relayedForReader(answer.answer, 'ka', CARD_RELAY);
  if (relayed.original !== undefined) {
    const original = originalUnder(answer, relayed.original, 'ka');
    return `${spoke}, რომ ${relayed.text.trim()}${original}`;
  }
  return quotedWhenNotRetold(answer, 'ka')
    ? `${spoke}: „${answer.answer.trim()}"`
    : `${spoke}, რომ ${answer.answer.trim()}`;
}

export async function buildAnswerCard(
  answers: readonly CardAnswer[],
  language: RunLanguage,
  georgianNames?: GeorgianCardNames,
): Promise<string> {
  if (language === 'ka' && georgianNames !== undefined) {
    const lines = await Promise.all(answers.map((a) => georgianCardLine(a, georgianNames)));
    const opening = georgianNames.ownerFirst;
    if (opening !== null && lines.length > 0) lines[0] = `${opening}, ${lines[0]}`;
    return lines.join('\n\n');
  }
  const heading = HEADING[language] ?? HEADING.ka;
  const lines = await Promise.all(answers.map((answer) => cardLine(answer, language)));
  return [answers.length === 1 ? heading.one : heading.many, ...lines].join('\n\n');
}

/** The owner's first name and the helpers' names, as the Georgian card writes them. */
async function georgianCardNames(
  ownerId: number,
  answers: readonly CardAnswer[],
): Promise<GeorgianCardNames> {
  const labels = [
    ...new Set(
      answers
        .flatMap((a) => [a.fromName?.trim(), a.viaName?.trim()])
        .filter((n): n is string => typeof n === 'string' && n !== ''),
    ),
  ];
  const [owner, shown] = await Promise.all([
    registeredName(String(ownerId)),
    georgianNamesFor(String(ownerId), labels),
  ]);
  const ownerFirst = owner === null ? '' : georgianFirstName(owner);
  return { ownerFirst: ownerFirst === '' ? null : ownerFirst, shown };
}

/** How far back the card a run was woken by is looked for. */
const CARD_LOOK_BACK_MINUTES = 15;

/**
 * #8154: the answers card the server wrote in this conversation just before an
 * answer-event run, or null. The server's own lines carry no run.
 */
export async function latestAnswerCard(threadId: number): Promise<string | null> {
  const result = await query<{ content: string }>(
    `SELECT content FROM conversations
      WHERE thread_id = $1 AND role = 'assistant' AND kind = 'message' AND run_id IS NULL
        AND created_at > NOW() - make_interval(mins => $2)
      ORDER BY created_at DESC LIMIT 1`,
    [threadId, CARD_LOOK_BACK_MINUTES],
    SHOWN_QUERY_TIMEOUT_MS,
  );
  return result.rows[0]?.content ?? null;
}

async function markAnswersShown(askIds: readonly number[]): Promise<void> {
  await query(
    `UPDATE task_asks SET answer_shown_at = COALESCE(answer_shown_at, NOW())
      WHERE id = ANY($1::int[])`,
    [askIds],
    SHOWN_QUERY_TIMEOUT_MS,
  );
}

/** Writes the card and pushes it to an open screen. */
async function writeCard(target: AnswerCardTarget, answers: readonly CardAnswer[]): Promise<void> {
  const language = await threadLanguage(target.threadId);
  const names = language === 'ka' ? await georgianCardNames(target.ownerId, answers) : undefined;
  const card = await buildAnswerCard(answers, language, names);
  const saved = await saveServerLine(target.threadId, target.ownerId, card);
  emitMessageAppended(String(target.ownerId), target.threadId, randomUUID(), {
    messageId: String(saved.id),
    kind: 'answers',
    content: saved.content,
    choices: [],
    ref: {},
  });
}

/**
 * Writes the card and marks the answers shown. True when the card is on the
 * owner's screen; on false the caller keeps the old delivery, where the
 * model's reply itself must carry every answer.
 *
 * A failed MARK still returns true: the card is there, and a reply that read
 * the answers out again under it is the duplicate this row exists to remove.
 * The cost is that a retry of a busy wake may write the card once more — which
 * is logged, and is the smaller of the two.
 */
/**
 * AB-004 b (the tester's 45153, 3 of 3): a „yes" tap is told to the owner at the
 * tap, in the helper's own button words (T2476). 13–24 s later the same yes
 * came again as „მოვიდა პასუხი: …", in words the helper did not say („ყავაზე
 * შეხვედრას დათანხმდა" for a tap of „free"). An answer that is not the
 * helper's own words, recorded within minutes of a „yes" that was already told,
 * is that tap again: it is marked shown and left off the card.
 */
const TAP_ECHO_MINUTES = 5;
/** Longer than this, the answer carries something of its own and is shown. */
const TAP_ECHO_MAX_CHARS = 120;
/** The meaning a model-written „yes" button carries (task_asks.choices). */
const YES_MEANS = 'yes';

interface TappedAsk {
  readonly id: number;
  readonly choices: unknown;
}

/** The „yes" label of an ask's own buttons; null for an ask with ours alone. */
function yesLabelOf(choices: unknown): string | null {
  if (!Array.isArray(choices)) return null;
  const yes = choices.find(
    (c: unknown) => (c as { means?: unknown } | null)?.means === YES_MEANS,
  ) as { label?: unknown } | undefined;
  return typeof yes?.label === 'string' ? yes.label : null;
}

/**
 * #6007 retest (the tester's 68824): only a tap that was TOLD is an echo. A
 * model-written „yes" („კი, თავისუფალი ვარ") is not told at the tap (see
 * askTapLineForAsker), so its answer is the only place the owner reads it.
 */
function wasToldAtTheTap(ask: TappedAsk): boolean {
  const label = yesLabelOf(ask.choices);
  return label === null || yesIsToldAtTheTap(label);
}

async function toldAtTheTap(answers: readonly CardAnswer[]): Promise<ReadonlySet<number>> {
  const candidates = answers
    .filter((a) => !a.verbatim && a.answer.trim().length <= TAP_ECHO_MAX_CHARS)
    .map((a) => a.askId);
  if (candidates.length === 0) return new Set();
  const result = await query<TappedAsk>(
    `SELECT id, choices FROM task_asks
      WHERE id = ANY($1::int[]) AND offered_help_at IS NOT NULL
        AND answered_at <= offered_help_at + make_interval(mins => $2)`,
    [candidates, TAP_ECHO_MINUTES],
    SHOWN_QUERY_TIMEOUT_MS,
  );
  return new Set(result.rows.filter(wasToldAtTheTap).map((r) => r.id));
}

export async function showAnswersToOwner(
  target: AnswerCardTarget,
  answers: readonly CardAnswer[],
): Promise<boolean> {
  if (answers.length === 0) return true;
  const told = await toldAtTheTap(answers).catch((err: unknown) => {
    // eslint-disable-next-line no-console
    console.error('[answer-card] could not read the taps:', (err as Error).message);
    return new Set<number>();
  });
  const toShow = answers.filter((a) => !told.has(a.askId));
  try {
    if (toShow.length > 0) await writeCard(target, toShow);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(
      `[answer-card] thread ${target.threadId}: card not written, the reply carries the answers:`,
      (err as Error).message,
    );
    return false;
  }
  await markAnswersShown(answers.map((answer) => answer.askId)).catch((err: unknown) =>
    // eslint-disable-next-line no-console
    console.error(
      `[answer-card] thread ${target.threadId}: card written but not marked shown:`,
      (err as Error).message,
    ),
  );
  return true;
}
