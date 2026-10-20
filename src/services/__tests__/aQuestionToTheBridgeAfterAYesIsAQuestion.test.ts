import { askIsTheIntroduction, ownerLinesInOrder } from '../introInstruction';

const GOAL = ['გია ახალაძე — გაცნობა'];
const FIRST =
  'გამაცანი გია ახალაძე, დავით ცდიაშვილი იცნობს. საქმიან თანამშრომლობაზე მინდა დაველაპარაკო.';
const YES = 'კი, დაიწყე';
const NEWS = 'დავით-ს ჰკითხე, გიასგან რამე სიახლე ხომ არ აქვს.';

/** #6361 retest (the tester's 69903, threads 61855–57). */
describe('a question to the go-between after the introduction was accepted', () => {
  it('is read in the order the owner wrote it', () => {
    expect(ownerLinesInOrder(GOAL, [NEWS, YES, FIRST])).toEqual([...GOAL, FIRST, YES, NEWS]);
  });

  it('goes to the go-between as a question', () => {
    const lines = ownerLinesInOrder(GOAL, [NEWS, YES, FIRST]);
    expect(askIsTheIntroduction(lines, 'დავით ცდიაშვილი')).toBe(false);
  });

  it('while the first request to him is still the introduction', () => {
    const lines = ownerLinesInOrder(GOAL, [FIRST]);
    expect(askIsTheIntroduction(lines, 'დავით ცდიაშვილი')).toBe(true);
  });
});
