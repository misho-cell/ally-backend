import { tradesKnownFor } from '../knownFor';
import { professionFamilyIn, professionFamilyKey } from '../professionFamilies';

/** 3566 (PR-010): „იურისტი" from one saver and „ადვოკატი" from another are one trade. */
describe('tradesKnownFor', () => {
  it('joins two words of one trade from two savers and says the trade once', () => {
    expect(
      tradesKnownFor([
        { saverId: 1, word: 'იურისტი' },
        { saverId: 2, word: 'ადვოკატი' },
      ]),
    ).toEqual(['იურისტი']);
  });

  it('says the word most savers used', () => {
    expect(
      tradesKnownFor([
        { saverId: 1, word: 'ადვოკატი' },
        { saverId: 2, word: 'ადვოკატი' },
        { saverId: 3, word: 'იურისტი' },
      ]),
    ).toEqual(['ადვოკატი']);
  });

  it('reads a trade inside a saved label', () => {
    expect(
      tradesKnownFor([
        { saverId: 1, word: 'ზურა სანტექნიკოსი' },
        { saverId: 2, word: 'ზურა სანტექნიკოსი' },
      ]),
    ).toEqual(['სანტექნიკოსი']);
  });

  it('says nothing one saver alone put on the owner', () => {
    expect(
      tradesKnownFor([
        { saverId: 1, word: 'იურისტი' },
        { saverId: 1, word: 'ადვოკატი' },
      ]),
    ).toEqual([]);
  });

  it('leaves out words that name no trade, however many savers used them', () => {
    expect(
      tradesKnownFor([
        { saverId: 1, word: 'მეგობარი' },
        { saverId: 2, word: 'მეგობარი' },
        { saverId: 3, word: 'მარიამ სამიზნე' },
      ]),
    ).toEqual([]);
  });

  it('puts the trade more savers named first', () => {
    expect(
      tradesKnownFor([
        { saverId: 1, word: 'ექიმი' },
        { saverId: 2, word: 'ექიმი' },
        { saverId: 1, word: 'lawyer' },
        { saverId: 2, word: 'იურისტი' },
        { saverId: 3, word: 'ადვოკატი' },
      ]),
    ).toEqual(['იურისტი', 'ექიმი']);
  });

  // 3566 (box 51877): the live trio, by tag and by label.
  it('joins „სტომატოლოგი" and „კბილის ექიმი" as one trade, not a doctor', () => {
    expect(
      tradesKnownFor([
        { saverId: 1, word: 'სტომატოლოგი' },
        { saverId: 2, word: 'კბილის ექიმი' },
      ]),
    ).toEqual(['სტომატოლოგი']);
    expect(
      tradesKnownFor([
        { saverId: 1, word: 'ნანა სტომატოლოგი' },
        { saverId: 2, word: 'ნანა კბილის ექიმი' },
      ]),
    ).toEqual(['სტომატოლოგი']);
  });
});

describe('professionFamilyIn', () => {
  it('finds the longest family phrase standing as whole words in a label', () => {
    expect(professionFamilyIn('ნანა კბილის ექიმი')).toBe('სტომატოლოგი');
    expect(professionFamilyIn('გია ექიმი')).toBe('ექიმი');
    expect(professionFamilyIn('Nino Lawyer')).toBe('იურისტი');
    expect(professionFamilyIn('Kitty')).toBeNull();
    expect(professionFamilyIn('მარიამ სამიზნე')).toBeNull();
  });
});

describe('professionFamilyKey', () => {
  it('names the family by its first word, and nothing for a word in no family', () => {
    expect(professionFamilyKey(' Lawyer ')).toBe('იურისტი');
    expect(professionFamilyKey('მეგობარი')).toBeNull();
    expect(professionFamilyKey('')).toBeNull();
  });
});
