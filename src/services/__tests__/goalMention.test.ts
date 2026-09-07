import { goalNamedIn } from '../goalMention';

const GOALS = [
  { id: 1519, title: 'ლიკა ოსეფაშვილთან გაცნობა' },
  { id: 1619, title: 'ბათუმის ფოტოგრაფი' },
  { id: 1651, title: 'ვიოლინოს მასწავლებელი ქუთაისში' },
  { id: 1420, title: 'ძაღლის ტრენერის პოვნა' },
];

describe('which open goal a message names', () => {
  // Thread 12946, 5 Sep: the sentence that ran as a quick answer.
  it('recognises a goal named by its title, inflected', () => {
    expect(goalNamedIn('ბათუმის ფოტოგრაფის მიზანი გავაგრძელოთ. რა ხდება იქ?', GOALS)?.id).toBe(
      1619,
    );
    expect(goalNamedIn('რა ხდება ვიოლინოს მასწავლებელზე ქუთაისში?', GOALS)?.id).toBe(1651);
  });

  it('needs the whole title, not one shared word', () => {
    // „ლიკა" alone is a person, not the goal about meeting her.
    expect(goalNamedIn('ლიკას დღეს დავურეკავ', GOALS)).toBeNull();
    expect(goalNamedIn('ფოტოგრაფი მჭირდება ქორწილისთვის', GOALS)).toBeNull();
  });

  it('names nothing on an unrelated message', () => {
    expect(goalNamedIn('რომელი რესტორანია კარგი ვაკეში?', GOALS)).toBeNull();
    expect(goalNamedIn('', GOALS)).toBeNull();
  });

  it('a title too short to be recognisable never matches', () => {
    expect(goalNamedIn('ბიზნესი', [{ id: 1, title: 'ბიზნესი' }])).toBeNull();
  });

  it('two goals that both fit is an ambiguity, and names nothing', () => {
    const twins = [
      { id: 1, title: 'ბათუმის ფოტოგრაფი' },
      { id: 2, title: 'ბათუმის ფოტოგრაფი ქორწილზე' },
    ];
    expect(goalNamedIn('ბათუმის ფოტოგრაფი ქორწილზე რა იქნა?', twins)).toBeNull();
    // …but a message that names only the shorter one is unambiguous.
    expect(goalNamedIn('ბათუმის ფოტოგრაფი რა იქნა?', twins)?.id).toBe(1);
  });

  it('a short common word does not stem-match a longer one', () => {
    // „ძაღ" vs „ძაღლის": below the stem length, so not the same word.
    expect(goalNamedIn('ძაღ ტრენერის პოვნა', GOALS)).toBeNull();
  });
});
