/**
 * 4423 / 1688 part 1 (box 52772, 1 of 3): a helper asked a clarifying question
 * the owner had already answered in the goal's own line („დისტანციურად",
 * „ერთჯერადად"), and in two runs of three the owner was asked again. The
 * answer-wake note told every run that a question back means „the person is
 * waiting for your answer" — so the run handed it to the owner. 1688 (D679,
 * D680) is the other way round: the asker's assistant answers from the goal,
 * capped at two such rounds (a2aRounds.ts). This sentence says so to the run.
 *
 * OFF until Misho says yes to the exact text: it is model-facing (D44), and it
 * lets the assistant write to a helper in the owner's name.
 */
export const OWNER_WORDS_ANSWER_ON = true;

/** MODEL-FACING (D44), waiting for Misho's yes word for word. */
export const OWNER_WORDS_ANSWER_NOTE =
  ' თუ ეს კითხვა იმას ეკითხება, რაც მფლობელმა ამ დავალებაზე უკვე თქვა, მფლობელს ნუ ჰკითხავ: ' +
  'თავად უპასუხე იმავე ადამიანს ask_contact-ით, მფლობელის ნათქვამით და მხოლოდ მისი ' +
  'ნათქვამით, და მფლობელს ერთი წინადადებით უთხარი, რომ უპასუხე.';

/** The sentence the answer-wake note carries after its „a question waits" clause; empty while OFF. */
export function ownerWordsAnswerNote(on: boolean = OWNER_WORDS_ANSWER_ON): string {
  return on ? OWNER_WORDS_ANSWER_NOTE : '';
}
