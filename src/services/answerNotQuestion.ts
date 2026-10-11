/**
 * 4423 (tester box 51382): a helper asked the owner a clarifying question and
 * the owner's assistant answered it by itself (1688 part 1) — with a question
 * back: „მუდმივი მოვლა გჭირდება, არა ერთჯერადი სამუშაო?". The helper asked
 * because they need to know; an answer in the owner's name states what the
 * owner said. So an assistant-only reply to a helper's question is not sent
 * while it is itself a question, and the run is told to write it as a statement.
 *
 * ON by Misho's „ყველა კი" on the morning list, 11 Oct ~06:15 UTC (§128,
 * NIGHT_QUESTIONS BL): the note is model-facing text (D44), approved as written.
 */
export const ANSWER_NOT_QUESTION_ON = true;

/** MODEL-FACING (D44), approved word for word — §128, NIGHT_QUESTIONS BL. */
export const ANSWER_NOT_QUESTION_NOTE =
  'არ გაიგზავნა: დამხმარემ კითხვა დაგისვა, და მფლობელის სახელით პასუხობ — ეს პასუხი უნდა ' +
  'იყოს, არა კითხვა. დაწერე, რა თქვა მფლობელმა, კითხვის ნიშნის გარეშე. თუ ეს არ იცი, ' +
  'ჯერ მფლობელს ჰკითხე და მისი სიტყვებით უპასუხე.';

/** Closing marks that may follow the question mark: quotes, brackets, spaces, emoji. */
const TRAILING_RE = /[\s"'“”„»«)\]\p{Extended_Pictographic}\uFE0F]+$/u;
const QUESTION_END_RE = /[?？]$/u;

/** Does the text end as a question, once closing quotes and emoji are set aside? */
export function endsAsAQuestion(text: string): boolean {
  return QUESTION_END_RE.test(text.replace(TRAILING_RE, ''));
}

export interface ReplyToHelper {
  /** The asker's assistant is writing with no person typing in between (a2aRounds). */
  readonly assistantOnly: boolean;
  /** What the helper last wrote on this ask; null when they have not answered. */
  readonly helperAnswer: string | null;
  /** What the assistant is about to send. */
  readonly reply: string;
}

/** Is this an assistant-only answer to a helper's question that is a question itself? */
export function answersAQuestionWithAQuestion(
  input: ReplyToHelper,
  on: boolean = ANSWER_NOT_QUESTION_ON,
): boolean {
  return (
    on &&
    input.assistantOnly &&
    input.helperAnswer !== null &&
    endsAsAQuestion(input.helperAnswer) &&
    endsAsAQuestion(input.reply)
  );
}
