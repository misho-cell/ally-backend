import { looksLikeGoalRequest, goalTitleFrom } from '../goalIntent';

describe('looksLikeGoalRequest (Ticket 16 Task 90: the rule, in code)', () => {
  it.each([
    'მჭირდება კარგი ელექტრიკოსი თბილისში, სამზარეულოში როზეტების გადასაკეთებლად.',
    'მჭირდება კარგი ინგლისურის მასწავლებელი თბილისში, კვირაში ორჯერ. ეს მიზნად შეინახე.',
    'ვეძებ ესპანურის მასწავლებელს ონლაინ.',
    'მინდა გავიცნო ვინმე TBC-ს IT განყოფილებიდან.',
    'I need a good videographer in Tbilisi for a corporate video.',
    'Looking for a corporate lawyer in Batumi.',
  ])('a stated need becomes a goal: %s', (message) => {
    expect(looksLikeGoalRequest(message)).toBe(true);
  });

  it.each([
    'რა ვიცი George Gvazava-ზე?',
    'ვინ არის ბესო ორთოიძე ჩემს კონტაქტებში?',
    'ბესო ორთოიძე და George Gvazava ერთმანეთს იცნობენ?',
    'გამარჯობა',
    'Who is Levan Lashkarava?',
  ])('a question about what is known stays a question: %s', (message) => {
    expect(looksLikeGoalRequest(message)).toBe(false);
  });
});

describe('goalTitleFrom', () => {
  it('drops the instructions and keeps the first sentence', () => {
    expect(
      goalTitleFrom(
        'მჭირდება კარგი ინგლისურის მასწავლებელი თბილისში, კვირაში ორჯერ. ეს მიზნად შეინახე.',
      ),
    ).toBe('მჭირდება კარგი ინგლისურის მასწავლებელი თბილისში, კვირაში ორჯერ');
    expect(
      goalTitleFrom(
        'მჭირდება კარგი ვიდეოგრაფი თბილისში კორპორატიული ვიდეოსთვის. ეს მიზნად შეინახე. მნიშვნელოვანი: არავის არ მისწერო და არავის დაუკავშირდე.',
      ),
    ).toBe('მჭირდება კარგი ვიდეოგრაფი თბილისში კორპორატიული ვიდეოსთვის');
  });

  it('caps a long message at a word boundary', () => {
    const title = goalTitleFrom('I need ' + 'a very specific person '.repeat(10));
    expect(title.length).toBeLessThanOrEqual(92);
    expect(title.endsWith('…')).toBe(true);
  });
});

describe('Ticket 19 [20] and [11]: what the box sends, and what the rule says', () => {
  // The report: every line typed into the „მომეცი მიზანი" box becomes a goal
  // with a proposed plan and an open question — which is the exact state item 0
  // failed in. These are the three lines the report says must stay questions.
  it('leaves the three named lines as questions', () => {
    expect(looksLikeGoalRequest('რომელი მიზნები მაქვს ღია?')).toBe(false);
    expect(looksLikeGoalRequest('რა შეგიძლია?')).toBe(false);
    expect(looksLikeGoalRequest('ვინ არის ახლა თბილისის მერი?')).toBe(false);
  });

  it('still opens a goal on a plainly stated need', () => {
    expect(looksLikeGoalRequest('მჭირდება კარგი სანტექნიკოსი თბილისში')).toBe(true);
  });

  // Item 11 asked what the rule does with this line. It says question — and
  // the reason is word order, not meaning: the patterns expect the verb right
  // after „მინდა", while Georgian commonly puts „მინდა" last („შეხვედრა
  // მინდა"). Recorded as the rule's answer TODAY. Whether it ought to be a
  // goal is the founder's call, not a thing to change quietly inside a test.
  it('says question for „X-თან შეხვედრა მინდა" — word order, not meaning', () => {
    expect(looksLikeGoalRequest('X-თან შეხვედრა მინდა')).toBe(false);
    // The same need with the verb after „მინდა" is caught, which is what makes
    // this a gap in the pattern rather than a decision about intent.
    expect(looksLikeGoalRequest('მინდა შევხვდე X-ს სამუშაო საკითხზე')).toBe(true);
  });
});
