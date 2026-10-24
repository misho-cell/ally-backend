/**
 * #7195 / #7459 retest (tester 74813, 65059/65061/65068): a helper's addition
 * joins the stored answer, and the asker's goal is woken again (#6865). The
 * wake carried the whole answer, so the asker's assistant read the first
 * answer once more and said „this is the same answer, nothing new", 3/3.
 *
 * What the asker has not heard yet: the lines after the answer that already
 * reached them, or the whole answer when nothing reached them or it was
 * rewritten since.
 */
export function unheardPartOf(answer: string, delivered: string | null): string {
  if (delivered === null || delivered.trim() === '') return answer;
  const prefix = `${delivered}\n`;
  if (!answer.startsWith(prefix)) return answer;
  const rest = answer.slice(prefix.length).trim();
  return rest === '' ? answer : rest;
}

/** An owed answer as the asker's wake should carry it. */
export function unheardAnswerOf(ask: {
  readonly answer: string | null;
  readonly delivered_answer?: string | null;
}): string {
  return unheardPartOf(ask.answer ?? '', ask.delivered_answer ?? null);
}
