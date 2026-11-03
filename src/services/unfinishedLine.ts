/**
 * #8649 (Lika's test, 3 Nov; thread 78564): „ჰკითხე ლიკას, ხომ არ იცნობს კარგ"
 * — the sentence stops on „კარგ" (good …), so WHAT to ask was never said. The
 * server read it as an instruction, called it the owner's consent, and the
 * ask went out at once with an invented word. A line that stops mid-thought
 * is not an instruction yet: the assistant asks the owner what they meant.
 *
 * Unfinished: it ends on an ellipsis, a comma, a colon or a dash, or its last
 * word is one that cannot end a request — an adjective or quantifier waiting
 * for its noun („კარგ", „ერთ", „a good"), or a word that opens a clause („თუ", „if"). Not „and" or „და": a server step cuts „… and tell me" down to its first half.
 */
const TRAILING_MARK_RE = /(?:\.\.\.|…|[,:;\-–—])\s*$/u;
const DANGLING_LAST_WORDS: ReadonlySet<string> = new Set([
  // Georgian: adjectives and quantifiers in their bare stem, joining words.
  'კარგ',
  'კარგი',
  'ცუდ',
  'ერთ',
  'ერთი',
  'ორ',
  'რამდენიმე',
  'რომელიმე',
  'ისეთ',
  'ისეთი',
  'ყველაზე',
  'ძალიან',

  'თუ',
  'რომ',
  'ხომ',
  'მაგალითად',
  // English
  'a',
  'an',
  'the',
  'good',
  'some',
  'any',
  'one',

  'if',
  'whether',
  'about',
  'for',
  'with',
  'of',
  'to',
  // Russian
  'хорошего',
  'хорошую',
  'хороший',
  'какого',

  'если',
  'про',
  'для',
]);
const LAST_WORD_RE = /([\p{L}]+)[^\p{L}]*$/u;

/** Does the line stop before saying what it asks? */
export function looksUnfinished(line: string): boolean {
  const text = line.trim();
  if (text === '' || /[?？!.]$/u.test(text.replace(/(?:\.\.\.|…)$/u, ''))) {
    return text.endsWith('...') || text.endsWith('…');
  }
  if (TRAILING_MARK_RE.test(text)) return true;
  const last = text.match(LAST_WORD_RE)?.[1]?.toLowerCase() ?? '';
  return DANGLING_LAST_WORDS.has(last);
}
