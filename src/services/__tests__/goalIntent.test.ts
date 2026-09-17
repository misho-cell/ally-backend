import {
  looksLikeGoalRequest,
  goalTitleFrom,
  isQuestionNotGoal,
  needsNoOpeningSearch,
} from '../goalIntent';

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

/**
 * Ticket 20 row 103 — the app flag is not a licence to turn a question into a
 * goal.
 *
 * „რომელი მიზნები მაქვს ღია" opened goal 4258 on Ninia's account and the run
 * then counted it among the 24 open goals it had just been asked about. The
 * live log names the path, so nothing here is inferred:
 *
 *   10:36:03 [goal-intent] thread 16402: goal 4258 opened from the message (app flag)
 *
 * `looksLikeGoalRequest` already answered false. The flag skipped it — and with
 * it every check in this file.
 */
describe('isQuestionNotGoal', () => {
  it('holds a question about the owner’s own goals, in either language', () => {
    expect(isQuestionNotGoal('რომელი მიზნები მაქვს ღია')).toBe(true);
    expect(isQuestionNotGoal('რამდენი მიზანი მაქვს?')).toBe(true);
    expect(isQuestionNotGoal('ჩემი მიზნები მაჩვენე')).toBe(true);
    expect(isQuestionNotGoal('which goals do I have open?')).toBe(true);
    expect(isQuestionNotGoal('how many open goals do I have')).toBe(true);
    expect(isQuestionNotGoal('list my goals')).toBe(true);
  });

  /**
   * The fix inside the fix. `\b` is ASCII-only, so there is no word boundary
   * between „არის" and the space after it, and every Georgian alternative in
   * ASK_ABOUT_RE has failed to match since Task 90 whenever a word followed —
   * while the English ones matched. These four are the ones that were broken.
   */
  it('recognises the Georgian question forms that the ASCII boundary was dropping', () => {
    expect(isQuestionNotGoal('ვინ არის განათლების მინისტრი?')).toBe(true);
    expect(isQuestionNotGoal('ვინ არიან ჩვენი ინვესტორები')).toBe(true);
    expect(isQuestionNotGoal('რას აკეთებს ნინია ახლა')).toBe(true);
    expect(isQuestionNotGoal('სად მუშაობს ლიკა')).toBe(true);
  });

  it('does not fire on a word that merely STARTS with a question word', () => {
    // „არისტოკრატს" begins with „არის". A prefix match here would silently
    // refuse a real goal, which is the same failure with the sign flipped.
    expect(isQuestionNotGoal('ვინ არისტოკრატს იცნობს — მჭირდება კონტაქტი')).toBe(false);
  });

  it('leaves every plainly stated need alone', () => {
    for (const need of [
      'მჭირდება კარგი ვეტერინარი თბილისში',
      'ვეძებ ბუღალტერს მცირე ბიზნესისთვის',
      'მინდა გავიცნო ინვესტორი',
      'I need a wedding photographer',
      'find me a notary in Batumi',
      // Names „მიზნები" without asking about the owner's own: still a goal.
      'მინდა ვიპოვო ტრენერი რომელიც მიზნებს დამისახავს',
    ]) {
      expect(isQuestionNotGoal(need)).toBe(false);
      expect(looksLikeGoalRequest(need)).toBe(true);
    }
  });
});

/**
 * The founder's ruling of 17 September: „look at what the person typed before
 * running anything. A question skips web_search:opening and
 * search_second_degree:opening entirely; a real goal keeps both."
 *
 * From the battery run of 19:00-19:36 — every string below is one somebody
 * actually typed that night, not an invented example.
 */
describe('what needs no opening search', () => {
  it('skips a question about the owner’s own contacts', () => {
    // Goal 4822. The opening web search read „ვინ" — the Georgian for „who" —
    // as a domain, searched VIN.GE, and reported „on the web I found: VIN.GE,
    // your contact there: …".
    expect(needsNoOpeningSearch('ვინ მყავს თბილისში?')).toBe(true);
    expect(needsNoOpeningSearch('How many contacts do I have in my network?')).toBe(true);
  });

  it('skips a question about the product', () => {
    expect(needsNoOpeningSearch('What is Netai and how much does it cost?')).toBe(true);
    expect(needsNoOpeningSearch('რამდენი ღირს Netai?')).toBe(true);
  });

  it('skips a question about the owner’s own goals', () => {
    expect(needsNoOpeningSearch('which goals do I have open right now?')).toBe(true);
  });

  it('KEEPS both searches on a real need, which is what they were built for', () => {
    // Row 126: a named problem starts the web and the second circle at once.
    // Skipping these would cost far more than the tax it saves.
    expect(needsNoOpeningSearch('ქორწილის ფოტოგრაფი მჭირდება ქუთაისში.')).toBe(false);
    expect(needsNoOpeningSearch('მჭირდება ინგლისურის მასწავლებელი ბავშვისთვის')).toBe(false);
    expect(
      needsNoOpeningSearch(
        'გამარჯობა, მაქვს კონსერვების საწარმო, მაგრამ მიჭირს მარკეტინგში, ამისთვის მჭირდება კომპანია',
      ),
    ).toBe(false);
  });

  it('keeps them on a goal that merely NAMES the product', () => {
    // „Netai" alone is not a question about Netai — plenty of real goals are
    // work ON it, and only the pairing with a price or a „what is this" makes
    // it a question about the product.
    expect(needsNoOpeningSearch('მჭირდება მარკეტინგის სპეციალისტი Netai-სთვის')).toBe(false);
  });

  it('keeps them on a question about a PERSON, which the web can answer', () => {
    expect(needsNoOpeningSearch('მარო კოშაძე ვინ არის?')).toBe(false);
  });
});
