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

/**
 * ⚠️ ROW 242, 25 September — ONE ADJECTIVE AND THE SAME NEED BECAME TWO GOALS.
 *
 * Netai Test 9, ten minutes apart:
 *
 *   10:26  „I need a marketing co-founder for my small food delivery startup
 *           in Tbilisi."   -> goal 10167
 *   10:36  „I need a marketing co-founder for my food delivery startup in
 *           Tbilisi."      -> goal 10231, joined to nothing
 *
 * The title is the model's SUMMARY OF THE FIRST MESSAGE, so a title carrying
 * one word the restatement does not — „small" — could never be matched by it.
 * Seven of eight words present and no match. The 24 September fix caught
 * identical sentences; this is one word off identical.
 */
describe('a title that says one word more than the restatement', () => {
  const GOAL = {
    id: 10167,
    title: 'I need a marketing co-founder for my small food delivery startup in Tbilisi',
  };

  it('matches the same need said again without the adjective', () => {
    expect(
      goalNamedIn('I need a marketing co-founder for my food delivery startup in Tbilisi.', [GOAL]),
    ).toBe(GOAL);
  });

  it('still matches when nothing is missing at all', () => {
    expect(goalNamedIn(GOAL.title, [GOAL])).toBe(GOAL);
  });

  /**
   * The tester's 1102 (F3) moved this line: two words dropped and none added is
   * the same need said shorter, by the same owner, about the same startup.
   */
  it('matches when the restatement drops two words and adds none', () => {
    expect(goalNamedIn('I need a marketing co-founder for my startup in Tbilisi.', [GOAL])).toBe(
      GOAL,
    );
  });

  it('does not match when the shorter message brings a word of its own', () => {
    expect(
      goalNamedIn('I need a marketing co-founder for my fintech startup in Tbilisi.', [GOAL]),
    ).toBeNull();
  });

  /**
   * THE LENGTH GATE IS THE SAFETY. A short title must still match in full —
   * forgiving one of three words is matching on two, and the measured pair in
   * real history that differs by one word is exactly a three-word title.
   */
  it('forgives nothing in a title too short to spare a word', () => {
    const short = { id: 1, title: 'ქუთაისში ფოტოგრაფი მჭირდება' };

    expect(goalNamedIn('ფოტოგრაფი მჭირდება', [short])).toBeNull();
    expect(goalNamedIn('ქორწილის ფოტოგრაფი მჭირდება ქუთაისში', [short])).toBe(short);
  });

  /**
   * „Exactly one goal or nothing" is unchanged. A looser rule that produced
   * two candidates would name neither — folding a new need into the wrong old
   * goal is the failure this whole matcher is shaped around.
   */
  it('still names nothing when the tolerance produces two candidates', () => {
    const a = { id: 1, title: 'I need a marketing co-founder for my small food delivery startup' };
    const b = { id: 2, title: 'I need a marketing co-founder for my large food delivery startup' };

    expect(
      goalNamedIn('I need a marketing co-founder for my food delivery startup', [a, b]),
    ).toBeNull();
  });
});

/**
 * The tester's 1013 (thread 30065): an inheritance-dispute lawyer was folded
 * into the land-dispute lawyer goal — the forgiven word was the one the new
 * message had replaced.
 */
describe('a word replaced, not dropped', () => {
  const land = { id: 13300, title: 'მჭირდება ადვოკატი მიწის დავაზე' };

  it('is a new request when the message puts its own word in the missing one’s place', () => {
    expect(goalNamedIn('მჭირდება ადვოკატი სამემკვიდრეო დავაზე', [land])).toBeNull();
  });

  it('still joins a restatement that only drops a word', () => {
    expect(goalNamedIn('მჭირდება ადვოკატი დავაზე', [land])?.id).toBe(13300);
  });

  it('still joins the same need said again in full', () => {
    expect(goalNamedIn('მჭირდება ადვოკატი მიწის დავაზე', [land])?.id).toBe(13300);
  });
});

/**
 * The tester's 1102 (F3, thread 32960): the same need said again, shorter, in
 * a new conversation opened a second goal while the first was still open.
 */
describe('the same need said again, shorter', () => {
  const PEDIATRICIAN = { id: 15013, title: 'კარგი პედიატრი მჭირდება დიდ დიღომში ჩემი შვილისთვის' };

  it('is the open goal, not a new one', () => {
    expect(goalNamedIn('პედიატრი მჭირდება დიდ დიღომში.', [PEDIATRICIAN])).toBe(PEDIATRICIAN);
  });

  it('is a new goal when the place differs', () => {
    expect(goalNamedIn('პედიატრი მჭირდება საბურთალოზე, ახლოს.', [PEDIATRICIAN])).toBeNull();
  });

  it('is a new goal when the message is too short to be sure', () => {
    const KUTAISI = { id: 1, title: 'ქუთაისში ფოტოგრაფი მჭირდება' };
    expect(goalNamedIn('ფოტოგრაფი მჭირდება', [KUTAISI])).toBeNull();
  });

  it('names nothing when two open goals fit it', () => {
    const other = { id: 15099, title: 'პედიატრი მჭირდება დიდ დიღომში შაბათს' };
    expect(goalNamedIn('პედიატრი მჭირდება დიდ დიღომში.', [PEDIATRICIAN, other])).toBeNull();
  });
});
