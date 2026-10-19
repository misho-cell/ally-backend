import { boundaryTerm, queryTerms } from '../askBoundary.service';

/** Exact or prefix either way — the comparison boundaryExclusionsFor makes in SQL. */
function meets(word: string, term: string): boolean {
  return word === term || term.startsWith(word) || word.startsWith(term);
}

function covered(subject: string, terms: readonly string[]): boolean {
  return queryTerms(subject).some((word) => terms.some((term) => meets(word, term)));
}

/** The bridge's own boundary as the tester's 68825 saved it: „don't bring me bank or loan questions". */
const BANKS_AND_LOANS = [
  'banks',
  'banking',
  'loans',
  'credit',
  'banki',
  'bankebi',
  'seski',
  'seskebi',
];

describe('#1694: a goal in Georgian meets a boundary through its case endings', () => {
  it('takes the ending off while the word is still Georgian', () => {
    expect(boundaryTerm('სესხზე')).toBe('sesk');
    expect(boundaryTerm('ბანკში')).toBe('bank');
  });

  it('keeps the bridge out of a TBC business-loan goal, as the goal is written', () => {
    expect(covered('თიბისის ბიზნეს სესხზე გადაწყვეტილების მიმღებთან მისვლა', BANKS_AND_LOANS)).toBe(
      true,
    );
    expect(covered('თიბისი ბანკში ბიზნეს სესხზე', BANKS_AND_LOANS)).toBe(true);
  });

  it('leaves a goal on another subject alone', () => {
    expect(covered('ნოტარიუსი ბინის ნასყიდობისთვის', BANKS_AND_LOANS)).toBe(false);
    expect(covered('find a plumber in Vake', BANKS_AND_LOANS)).toBe(false);
  });

  it('reads a Latin word as before', () => {
    expect(boundaryTerm('Loans')).toBe('loans');
  });
});
