/**
 * D709, the tester's 44194: a plain yes to an open introduction question, in any
 * of the four languages. Its own module so the introduction service and its
 * helpers can read it without importing each other.
 */
const PLAIN_YES_RE =
  /^\s*(?:კი|დიახ|ხო|yes|yeah|ok|okay|да|sí)(?:[\s,!.]+(?:დააკავშირე|დაგაკავშირებ|გაგაცნობ|connect them|i'?ll connect you|свяжи их|conéctalos))?[\s!.]*$/iu;

export function isPlainYes(message: string): boolean {
  return PLAIN_YES_RE.test(message);
}
