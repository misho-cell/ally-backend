/**
 * Engagement chat 74153 (23 Oct, a real member): he registered under his
 * initials, the welcome study web-searched the initials, and saved an unrelated
 * page (a US state) as his public profile — while other members' labels for
 * his number gave his full name.
 *
 * The name the registration research searches: the account name when it is a
 * whole name; otherwise the full name most of the people who saved this number
 * used. Null when neither is a whole name — no web search beats a wrong one.
 */
const WORD_SPLIT_RE = /\s+/u;
const NAME_WORD_RE = /^\p{L}[\p{L}'’-]*$/u;
const MIN_NAME_WORD_CHARS = 3;
const MIN_NAME_WORDS = 2;

/** Two or more words of letters, each at least three letters long: „G.K." and „Gio" are not. */
export function isWholeName(name: string): boolean {
  const words = name
    .trim()
    .split(WORD_SPLIT_RE)
    .filter((w) => w !== '');
  return (
    words.length >= MIN_NAME_WORDS &&
    words.every((w) => NAME_WORD_RE.test(w) && w.length >= MIN_NAME_WORD_CHARS)
  );
}

export interface LabelCount {
  readonly label: string;
  readonly count: number;
}

export function nameToResearch(registered: string, labels: readonly LabelCount[]): string | null {
  if (isWholeName(registered)) return registered.trim();
  const best = labels.filter((l) => isWholeName(l.label)).sort((a, b) => b.count - a.count)[0];
  return best === undefined ? null : best.label.trim();
}
