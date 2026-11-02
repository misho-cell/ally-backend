/**
 * #8524 (the tester's 80752 item 10, case 77; Misho's yes, 2 Nov): „სად მუშაობს
 * ნიკა?" took 27–35 s, and about 17 s of it was the answer written twice —
 * Claude's final (≈9 s), thrown away, then GPT's rewrite (≈9 s, row 129). A short
 * answer that proposed no plan and sent nothing keeps Claude's words.
 *
 * Test seats only until the tester had read the answers: RETEST-4 (2 Nov, the
 * tester's 80984) found them right, so it is on for everyone.
 */
export const SHORT_ANSWER_MAX_CHARS = 300;
export const SHORT_ANSWER_ON_TEST_SEATS_ONLY = false;

export interface RunActs {
  readonly proposedAPlan: boolean;
  readonly sentSomething: boolean;
  readonly hasChoices: boolean;
}

/** Claude's draft stands without the rewrite: short, and the run neither planned nor sent. */
export function shortAnswerStands(draft: string, acts: RunActs): boolean {
  const text = draft.trim();
  return (
    text !== '' &&
    text.length <= SHORT_ANSWER_MAX_CHARS &&
    !acts.proposedAPlan &&
    !acts.sentSomething &&
    !acts.hasChoices
  );
}
