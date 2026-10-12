/**
 * 2971 (the tester's chat #9, conv 44420, 1 of 3): „რისი ცოდნა გინდა ჩემზე?"
 * put the profile question — „რომელი ტიპის გაცნობა არ გავაკეთო შენთვის?" —
 * only in a live step bubble, and the message the owner keeps said only
 * „ვუცდი შენს პასუხს." with the five answer buttons under it. Once the bubble
 * is gone the owner sees buttons with no question. The run's own question is
 * put back in front of its buttons; no word is added.
 */
const QUESTION_MARK_RE = /[?？]/u;
const QUESTION_END_RE = /[?？]\s*$/u;
const SENTENCE_SPLIT_RE = /(?<=[.!?？…])\s+/u;

/** The last question the run asked in its step bubbles, newest first; null for none. */
export function lastStepQuestion(stepTexts: readonly string[]): string | null {
  for (let i = stepTexts.length - 1; i >= 0; i -= 1) {
    const sentences = stepTexts[i].split(SENTENCE_SPLIT_RE).map((s) => s.trim());
    const question = [...sentences].reverse().find((s) => QUESTION_END_RE.test(s));
    if (question !== undefined) return question;
  }
  return null;
}

/** The reply with its buttons' question in it: unchanged when it already asks one. */
export function withQuestionFromSteps(reply: string, stepTexts: readonly string[]): string {
  if (QUESTION_MARK_RE.test(reply)) return reply;
  const question = lastStepQuestion(stepTexts);
  if (question === null) return reply;
  return reply.trim() === '' ? question : `${question}\n\n${reply.trimStart()}`;
}
