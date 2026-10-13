/**
 * T2479 (§98.3; the MASTER TEST RUN's IN-002 / PR-007): „გამაცანი თამთა
 * გამოგონილი, ბახვა გამოგონილი იცნობს." + „ვადასტურებ" — the owner asked to be
 * INTRODUCED, and the run sent the go-between a plain question with ask_contact.
 * An introduction goes through request_introduction: the person asked gets the
 * introduction card, and a yes connects the two.
 *
 * Only the imperative to Netai counts. Case 1's „გამაცნობს თუ არა" asks the
 * helper whether HE will introduce — that is a question, and stays one.
 * 3697: „სთხოვე მაიას, გამაცნოს ბახვა" (ask Maia to introduce me) is the
 * same request through a named go-between, and is one.
 */
const OWNER_INTRO_RE =
  /(გამაცანი|დამაკავშირე|გამაცნოს|გაგვაცნოს|\bintroduce\s+(?:me|us)\s+to\b|\bconnect\s+me\s+(?:with|to)\b|познакомь\s+меня|preséntame)/iu;

/** True when one of the owner's lines on this goal tells Netai to introduce them. */
export function ownerAsksForIntroduction(ownerLines: readonly string[]): boolean {
  return ownerLines.some((line) => OWNER_INTRO_RE.test(line));
}

export const USE_INTRODUCTION_REFUSAL =
  'Not sent: the owner asked to be INTRODUCED to someone — that is an introduction, not a ' +
  'question. Call request_introduction instead: the person who knows them is the go-between, ' +
  'the person the owner wants to meet is the target. Do not tell the owner about this refusal; ' +
  'make the introduction request now.';
