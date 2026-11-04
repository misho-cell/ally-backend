/**
 * #8947 (battery 5 Nov; part of #8779): the rewrite pass changed meaning — it
 * removed the web paragraph (case 5), cut prices (case 4) and left links empty
 * („ბმული:" case 3, „წყარო:" case 8). The founder: a rewrite may fix the words,
 * never remove a fact. When the writer's version has lost a link, a number, or
 * most of the text, Claude's own answer stands.
 */
const URL_RE = /https?:\/\/[^\s<>()[\]"'„“]+/giu;
const TRAILING_PUNCTUATION_RE = /[.,;:!?…»”]+$/u;
/** Prices, phones, years, counts of three digits or more — „5" or „10" may fairly be reworded. */
const NUMBER_RE = /\d[\d\s.,]*\d/gu;
const MIN_DIGITS_KEPT = 3;
/** A rewrite shorter than this share of the original lost more than wording. */
const MIN_LENGTH_SHARE = 0.5;

function urlsOf(text: string): Set<string> {
  return new Set(
    (text.match(URL_RE) ?? []).map((url) =>
      url.replace(TRAILING_PUNCTUATION_RE, '').replace(/\/$/u, '').toLowerCase(),
    ),
  );
}

function numbersOf(text: string): Set<string> {
  return new Set(
    (text.match(NUMBER_RE) ?? [])
      .map((run) => run.replace(/\D/gu, ''))
      .filter((digits) => digits.length >= MIN_DIGITS_KEPT),
  );
}

/** True when the rewrite lost a link, a number, or more than half the text. */
export function rewriteDropsFacts(original: string, rewritten: string): boolean {
  const before = original.trim();
  const after = rewritten.trim();
  if (before === '') return false;
  if (after.length < before.length * MIN_LENGTH_SHARE) return true;
  const keptUrls = urlsOf(after);
  if ([...urlsOf(before)].some((url) => !keptUrls.has(url))) return true;
  const keptDigits = after.replace(/\D/gu, '');
  return [...numbersOf(before)].some((digits) => !keptDigits.includes(digits));
}
