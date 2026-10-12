/**
 * 2971 (the tester's run, 8 Oct, conv 44420, 1 of 3): „რისი ცოდნა გინდა
 * ჩემზე?" — the profile question went out only as a live step bubble, and the
 * message the owner keeps said „ვუცდი შენს პასუხს." over five answer buttons.
 * Once the bubble was gone the owner saw buttons and no question.
 *
 * A reply with buttons and no question of its own takes the last question a
 * step of the same run asked; that step goes.
 */
const QUESTION_MARK_RE = /[?？]/u;
const SENTENCE_RE = /[^.!?？\n]*[?？]/gu;

export interface StepText {
  readonly id: number | string;
  readonly text: string;
}

/** The last question sentence in a text, trimmed; null when it asks nothing. */
export function lastQuestionIn(text: string): string | null {
  const questions = text.match(SENTENCE_RE);
  const last = questions?.[questions.length - 1]?.trim() ?? '';
  return last === '' ? null : last;
}

/** The question the buttons answer, and the step it came from; null when the reply asks it itself. */
export function questionForButtons(
  reply: string,
  steps: readonly StepText[],
): { readonly question: string; readonly step: StepText } | null {
  if (QUESTION_MARK_RE.test(reply)) return null;
  for (let i = steps.length - 1; i >= 0; i -= 1) {
    const question = lastQuestionIn(steps[i].text);
    if (question !== null) return { question, step: steps[i] };
  }
  return null;
}
