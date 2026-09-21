import { buildSearchTerms, georgianVariants, latinToGeorgian } from '../transliterate';

/**
 * Row 222's other direction, and the numbers that made it worth doing.
 *
 * Georgian → Latin has worked since August. Latin → Georgian never existed, and
 * the plate carried it as „58 rows, 13% of traffic" — which counted QUERIES.
 * Counted 21 September on the live base, phones whose label carries the
 * Georgian spelling and no Latin twin at all:
 *
 *   ექიმ        10,126 Georgian   3,584 Latin   8,576 unreachable in Latin
 *   მასწავლებ    7,088            5,289         6,589
 *   იურისტ       1,556            2,757         1,059
 *   ფოტოგრაფ       540              410           448
 *
 * 16,672 people on four words. The seat reopened it with „iuristi 40 vs
 * იურისტი 46, six people one-way" on one account; six on one account is one
 * account's share of a thousand.
 */

/** Every pair below is a real trade word and its real Georgian stem. */
const REACHED: readonly [string, string][] = [
  ['iuristi', 'იურისტ'],
  ['ekimi', 'ექიმ'],
  ['eqimi', 'ექიმ'],
  ['maswavlebeli', 'მასწავლებ'],
  ['fotografi', 'ფოტოგრაფ'],
  ['kurieri', 'კურიერ'],
  ['mdzgholi', 'მძღოლ'],
  ['buhalteri', 'ბუღალტერ'],
  ['stomatologi', 'სტომატოლოგ'],
  ['arkitektori', 'არქიტექტორ'],
  ['dizaineri', 'დიზაინერ'],
  ['jurnalisti', 'ჟურნალისტ'],
  ['mzareuli', 'მზარეულ'],
  ['thargmani', 'თარგმან'],
  ['dalaqi', 'დალაქ'],
  ['marketingi', 'მარკეტინგ'],
];

const reaches = (latin: string, stem: string): boolean =>
  georgianVariants(latin).some((v) => v.startsWith(stem));

describe('a Latin query reaches a label written in Georgian', () => {
  it.each(REACHED)('%s reaches %s', (latin, stem) => {
    expect(reaches(latin, stem)).toBe(true);
  });

  /**
   * „marketing" is the reason the two ambiguities are combined rather than
   * tried one at a time. მარკეტინგი needs თ→ტ AND ქ→კ at once; trying each
   * singly spends the budget on მარქეტინგი and მარკეთინგი and never arrives.
   */
  it('combines its two ambiguities instead of trying them singly', () => {
    expect(georgianVariants('marketingi')).toEqual([
      'მარქეთინგი',
      'მარქეტინგი',
      'მარკეთინგი',
      'მარკეტინგი',
    ]);
  });
});

/**
 * The limit, stated rather than left to be discovered. „elektrikosi" is
 * ელექტრიკოსი, where the first `k` is ქ and the second is კ. A whole-letter
 * swap cannot spell one letter two ways in one word, and no longer list fixes
 * it — it needs a character class in the pattern (`ელე[ქკ]ტრი[ქკ]ოსი`), which
 * the regex path cannot carry today because it takes plain strings.
 */
describe('what it cannot do, and will not pretend to', () => {
  it.each([
    ['elektrikosi', 'ელექტრიკოს'],
    ['santeknikosi', 'სანტექნიკოს'],
  ])('%s does not reach %s — one letter, two readings, one word', (latin, stem) => {
    expect(reaches(latin, stem)).toBe(false);
  });
});

describe('the cost, which row 108 is about', () => {
  /** At most four, and usually fewer — measured at 2.7 per word over these. */
  it('never sends more than four Georgian readings', () => {
    for (const [latin] of REACHED) {
      expect(georgianVariants(latin).length).toBeLessThanOrEqual(4);
    }
  });

  it('sends only one when the word has no ambiguous letter', () => {
    expect(georgianVariants('maswavlebeli')).toEqual(['მასწავლებელი']);
    expect(georgianVariants('msheneblobi')).toEqual(['მშენებლობი']);
  });

  /** A short reading becomes an exact-token pattern, where a guess is noise. */
  it('sends none for a term too short to be worth a pattern', () => {
    expect(georgianVariants('gio')).toEqual([]);
    expect(georgianVariants('nino')).toEqual([]);
  });

  it('sends none for a query that is already Georgian', () => {
    expect(georgianVariants('იურისტი')).toEqual([]);
  });
});

describe('the character map itself', () => {
  it('reads digraphs before letters', () => {
    expect(latinToGeorgian('shota')).toBe('შოთა');
    expect(latinToGeorgian('chkheidze')).toBe('ჩხეიძე');
    expect(latinToGeorgian('zhvania')).toBe('ჟვანია');
  });

  /** Not a Georgian sound, but how წ is typed — მასწავლებელი and nothing else. */
  it('reads w as წ', () => {
    expect(latinToGeorgian('maswavlebeli')).toBe('მასწავლებელი');
  });

  it('leaves a character it has no reading for alone', () => {
    expect(latinToGeorgian('c++')).toBe('ც++');
  });
});

describe('it rides along with the terms already built', () => {
  it('adds the Georgian readings to a Latin query', () => {
    expect(buildSearchTerms('iuristi')).toEqual(['iuristi', 'იურისთი', 'იურისტი']);
  });

  /** A Georgian query already had its Latin side and gains nothing here. */
  it('changes nothing for a Georgian query', () => {
    expect(buildSearchTerms('იურისტი')).toEqual(['იურისტი', 'iuristi']);
  });
});
