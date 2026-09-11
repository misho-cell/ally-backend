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
