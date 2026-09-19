import { isQuestionNotGoal } from '../goalIntent';

/**
 * Ticket 20 row 103 — „რა შეგიძლია?" is on the founder's own list and was not
 * being caught.
 *
 * Row 103's done-when names three sentences that must stay questions when
 * typed into the box: „რომელი მიზნები მაქვს ღია?", „რა შეგიძლია?" and „ვინ
 * არის ახლა თბილისის მერი?". Two were caught. The third was not — and it is
 * the sentence the row was reproduced on, goal #3070 on 15 September.
 *
 * Found on 19 September when the seat re-ran the flag path on the deployed
 * build and asked which predicate had run. None had: nothing classified the
 * sentence as a question, so it never reached the clause that would have
 * stopped it.
 */
describe('a question about what the assistant can do is not a goal', () => {
  it('catches the sentence from the founder’s own done-when', () => {
    expect(isQuestionNotGoal('რა შეგიძლია?')).toBe(true);
  });

  it('catches it inflected and in English, which is the point of the stem', () => {
    for (const message of [
      'რა შეგიძლია',
      'რა შეგიძლიათ?',
      'რის გაკეთება შეგიძლია ჩემთვის?',
      'როგორ მეხმარები?',
      'What can you do?',
      'what can you do for me',
      'What do you do?',
    ]) {
      expect(isQuestionNotGoal(message)).toBe(true);
    }
  });

  it('still catches the other two the founder named', () => {
    expect(isQuestionNotGoal('რომელი მიზნები მაქვს ღია?')).toBe(true);
    expect(isQuestionNotGoal('ვინ არის ახლა თბილისის მერი?')).toBe(true);
  });

  /**
   * The boundary I got wrong first, in a file whose own comment forty lines up
   * explains why. „რა შეგიძლია" ends in „ა", so a lookahead for „not a letter"
   * after the stem „შეგიძლი" fails on the very inflection the stem exists to
   * survive. Georgian inflects at the END, which is where a boundary looks.
   */
  it('a real goal that merely starts with „რა" is untouched', () => {
    expect(isQuestionNotGoal('რა ღირს ეს')).toBe(false);
    expect(isQuestionNotGoal('რა მჭირდება ამისთვის')).toBe(false);
  });

  it('leaves ordinary stated needs alone — those ARE goals', () => {
    for (const message of [
      'მჭირდება კარგი სტომატოლოგი თბილისში',
      'I need a good photographer in Tbilisi',
      'შეგიძლია მომიძებნო კარგი ბუღალტერი',
    ]) {
      expect(isQuestionNotGoal(message)).toBe(false);
    }
  });

  /**
   * NOT caught, and deliberately so — this is the undecided half of row 103.
   * `needsNoOpeningSearch` already treats it as a question for the purpose of
   * skipping the opening search, and its comment says in as many words that
   * whether such a sentence should also be stopped from opening a GOAL „is row
   * 103 and is not decided". It is the founder's, not mine, and the seat has
   * now measured it twice.
   */
  it('does NOT yet cover „how many contacts do I have" — that one is undecided', () => {
    expect(isQuestionNotGoal('How many contacts do I have in my network?')).toBe(false);
    expect(isQuestionNotGoal('რამდენი კონტაქტი მყავს?')).toBe(false);
  });
});
