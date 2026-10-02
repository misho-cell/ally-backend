import { sharesMostWords } from '../taskAsks.service';

/**
 * #34 — the tester's 1055 (threads 31058 / 31062): the helper typed one word
 * order and their assistant sent another. Same words → the helper's own line goes.
 */
describe('the approved text against the helper’s own line', () => {
  const own = 'ორშაბათს 10-დან 14 საათამდე, მეორე სართულზე, 7 ნომერ კაბინეტში.';

  it('sees a rearranged copy as the same words', () => {
    expect(
      sharesMostWords(own, 'ორშაბათს 10-დან 14 საათამდე, მეორე სართულზე, კაბინეტი ნომერი 7.'),
    ).toBe(true);
  });

  it('does not take a confirmation or a different answer for the helper’s answer', () => {
    expect(sharesMostWords('კი, გაუგზავნე', 'ორშაბათს 10-დან 14 საათამდე იღებს')).toBe(false);
    expect(sharesMostWords(own, 'სამშაბათს მოდი, დილით.')).toBe(false);
  });
});
