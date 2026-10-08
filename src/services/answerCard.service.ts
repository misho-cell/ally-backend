import { randomUUID } from 'crypto';
import { query } from '../db/postgres/client';
import { relayedForReader } from './askTranslation.service';
import { RunLanguage } from './runLanguage';
import { emitMessageAppended } from './sse.service';
import { saveServerLine, threadLanguage } from './threads.service';

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

/** One answer's line: their own words in quotes, anything else without. */
async function cardLine(answer: CardAnswer, language: RunLanguage): Promise<string> {
  const via = answer.viaName?.trim();
  const who = `${answer.fromName?.trim() || SOMEBODY[language]}${via ? ` (${VIA[language]} ${via})` : ''}`;
  const relayed = await relayedForReader(answer.answer, language, 'answer');
  if (relayed.original === undefined) {
    return answer.verbatim
      ? `${who}: „${answer.answer.trim()}"`
      : `${who}: ${answer.answer.trim()}`;
  }
  const original = answer.verbatim ? `\n(„${relayed.original.trim()}")` : '';
  return `${who}: ${relayed.text.trim()}${original}`;
}

export async function buildAnswerCard(
  answers: readonly CardAnswer[],
  language: RunLanguage,
): Promise<string> {
  const heading = HEADING[language] ?? HEADING.ka;
  const lines = await Promise.all(answers.map((answer) => cardLine(answer, language)));
  return [answers.length === 1 ? heading.one : heading.many, ...lines].join('\n\n');
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
  const card = await buildAnswerCard(answers, language);
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

async function toldAtTheTap(answers: readonly CardAnswer[]): Promise<ReadonlySet<number>> {
  const candidates = answers
    .filter((a) => !a.verbatim && a.answer.trim().length <= TAP_ECHO_MAX_CHARS)
    .map((a) => a.askId);
  if (candidates.length === 0) return new Set();
  const result = await query<{ id: number }>(
    `SELECT id FROM task_asks
      WHERE id = ANY($1::int[]) AND offered_help_at IS NOT NULL
        AND answered_at <= offered_help_at + make_interval(mins => $2)`,
    [candidates, TAP_ECHO_MINUTES],
    SHOWN_QUERY_TIMEOUT_MS,
  );
  return new Set(result.rows.map((r) => r.id));
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
