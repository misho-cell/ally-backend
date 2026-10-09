import { allPeopleText, ChoiceMeaning } from '../askChoices';

/**
 * 2186 (the founder's own screen, 7 Oct): asked whom she would recommend, the
 * helper could name only one. „Both" is every person offered.
 */
const CHOICES = [
  { label: 'ნინო სტომატოლოგი', means: ChoiceMeaning.Answer, detail: 'კლინიკა ღიმილი, ვაკე' },
  { label: 'გია ექიმი', means: ChoiceMeaning.Answer },
  { label: 'ვერ ვურჩევ', means: ChoiceMeaning.No },
  { label: 'მოგვიანებით', means: ChoiceMeaning.Later },
];

describe('a helper may recommend more than one (2186)', () => {
  it.each(['ორივე', 'ორივე, რა თქმა უნდა', 'Both', 'all of them', 'Оба', 'Ambos'])(
    '„%s" names both, with what she saved',
    (line) => {
      expect(allPeopleText(line, CHOICES)).toBe(
        'ნინო სტომატოლოგი (კლინიკა ღიმილი, ვაკე); გია ექიმი',
      );
    },
  );

  it('a single name, or a sentence about something else, is not „both"', () => {
    expect(allPeopleText('ნინო სტომატოლოგი', CHOICES)).toBeNull();
    expect(allPeopleText('ორივე ცუდი ვარიანტია, სხვას გირჩევ ვინმეს', CHOICES)).toBeNull();
  });

  it('with one person offered there is no „both"', () => {
    expect(allPeopleText('both', CHOICES.slice(1))).toBeNull();
  });
});
