/**
 * 3367 (conv 45133). „რა არის ახალი?": check_my_inbox found two questions
 * from other people, and the reply was „ახალი არაფერია." A question the owner
 * is not told about is never answered, so the server lists the ones a reply
 * leaves out, after it, as their own card.
 */
export interface InboxQuestion {
  readonly from: string;
  readonly question: string;
}

/** A first name this long or longer may lose its last letter to a case ending. */
const NAME_STEM_MIN = 4;

/** Letters and digits only, lowercased: how a name is looked for in a reply. */
function lettersOnly(text: string): string {
  return text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
}

/**
 * Whether the reply names who asks. The first name is enough, and its last
 * letter may go: Georgian declines it („ბახვა" → „ბახვამ", „გიორგი" → „გიორგის").
 */
function replyNamesAsker(said: string, from: string): boolean {
  const first = lettersOnly(from.trim().split(/\s+/u)[0] ?? '');
  if (first === '') return true;
  const stem = first.length >= NAME_STEM_MIN ? first.slice(0, -1) : first;
  return said.includes(stem);
}

/** The questions whose askers the finished reply never named. */
export function questionsTheReplyLeftOut(
  questions: readonly InboxQuestion[],
  reply: string,
): InboxQuestion[] {
  const said = lettersOnly(reply);
  return questions.filter((q) => !replyNamesAsker(said, q.from));
}
