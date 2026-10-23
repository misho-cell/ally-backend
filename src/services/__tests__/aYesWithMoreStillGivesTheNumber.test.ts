/**
 * #7228 (audit, 62932): Netai asked „tornike abuladze ნომერი გავუგზავნო
 * გიორგის?", the owner answered with a yes, a give word and a second
 * instruction, and the share was refused four times.
 */
import { answersTheOffer } from '../shareNumber.service';

describe('a yes that goes on with another instruction answers the offer', () => {
  it('reads the 62932 line as the owner’s word', () => {
    expect(
      answersTheOffer('კი გაუგზავნე და თორნიკეს მიწერე რო მე დავაკავშირე და გიორგი შეეხმიანება'),
    ).toBe(true);
  });

  it('reads a give word that opens the line', () => {
    expect(answersTheOffer('გაუგზავნე, და უთხარი რომ ჩემგანაა')).toBe(true);
    expect(answersTheOffer('yes send it, and tell him I said hi')).toBe(true);
  });

  it('still reads a bare yes and a pick', () => {
    expect(answersTheOffer('კი')).toBe(true);
    expect(answersTheOffer('მეორე')).toBe(true);
  });

  it('does not read a yes that holds the instruction back', () => {
    expect(answersTheOffer('კი გაუგზავნე, მაგრამ ჯერ არა')).toBe(false);
    expect(answersTheOffer('გაუგზავნე მოიცა ჯერ')).toBe(false);
  });

  it('does not read a line that only starts with yes and gives nothing', () => {
    expect(answersTheOffer('კი ვიცნობ, კარგი ბიჭია')).toBe(false);
    expect(answersTheOffer('გაუგზავნელი დარჩა წერილი')).toBe(false);
  });
});
