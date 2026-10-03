/**
 * Tester 1075, conversation 31788: „ჰკითხე ლაშა მძღოლს" names the contact
 * saved as „ლაშა მძღოლი", and the strict whole-label test said it named
 * nobody. The match decides who receives a message, so the tests that keep
 * it narrow matter as much as the one that widens it.
 */
import { labelNamedIn } from '../namedLabel';

describe('labelNamedIn', () => {
  it('still matches a whole label inside the sentence', () => {
    expect(labelNamedIn('ჰკითხე Netai Test 14-ს, იცნობს თუ არა', 'Netai Test 14')).toBe(true);
    expect(labelNamedIn('ჰკითხე გიორგის, ვის იცნობს', 'გიორგი')).toBe(true);
  });

  it('matches a label ending in -ი in its declined forms', () => {
    expect(labelNamedIn('ჰკითხე ლაშა მძღოლს, ვის იცნობს.', 'ლაშა მძღოლი')).toBe(true);
    expect(labelNamedIn('ლაშა მძღოლმა უნდა იცოდეს', 'ლაშა მძღოლი')).toBe(true);
    expect(labelNamedIn('მიწერე ნიკა ექიმს', 'ნიკა ექიმი')).toBe(true);
  });

  it('does not match a different word that only starts like the label', () => {
    expect(labelNamedIn('ჰკითხე გიორგაძეს', 'გიორგი')).toBe(false);
    expect(labelNamedIn('ჰკითხე ლაშა მძღოლსაც კი', 'ლაშა მძღოლი')).toBe(false);
  });

  it('does not decline a label that does not end in -ი', () => {
    expect(labelNamedIn('ჰკითხე Netai Test 1', 'Netai Test 14')).toBe(false);
    expect(labelNamedIn('ჰკითხე ნინს', 'ნინო')).toBe(false);
  });

  it('names nobody with an empty label', () => {
    expect(labelNamedIn('ჰკითხე ვინმეს', '   ')).toBe(false);
  });
});
