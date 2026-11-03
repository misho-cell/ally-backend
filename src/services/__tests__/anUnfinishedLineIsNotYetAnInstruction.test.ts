import { looksLikeContactInstruction } from '../goalIntent';
import { looksUnfinished } from '../unfinishedLine';

/** #8649 (Lika's test, 3 Nov; thread 78564): „ჰკითხე ლიკას, ხომ არ იცნობს კარგ". */
describe('a line that stops mid-thought is not an instruction yet', () => {
  it('reads the case line and others like it as unfinished', () => {
    for (const line of [
      'ჰკითხე ლიკას, ხომ არ იცნობს კარგ',
      'ჰკითხე ლიკას, ხომ არ იცნობს ერთ',
      'ask Lika if she knows a good',
      'ask Lika whether',
      'ჰკითხე ნიკას...',
      'ჰკითხე ნიკას,',
    ])
      expect(looksUnfinished(line)).toBe(true);
  });

  it('keeps finished instructions finished', () => {
    for (const line of [
      'ჰკითხე ლიკას, ხომ არ იცნობს კარგ ხელოსანს',
      'კითხე ლიკას',
      'ask Lika if she knows a good plumber',
      'ჰკითხე ნიკას, ხომ არ იცის?',
      'მისწერე გიორგის.',
    ])
      expect(looksUnfinished(line)).toBe(false);
  });

  it('does not let the unfinished line count as the owner’s instruction', () => {
    expect(looksLikeContactInstruction('ჰკითხე ლიკას, ხომ არ იცნობს კარგ')).toBe(false);
    expect(looksLikeContactInstruction('ჰკითხე ლიკას, ხომ არ იცნობს კარგ ხელოსანს')).toBe(true);
  });
});
