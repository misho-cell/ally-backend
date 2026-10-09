import {
  looksLikeGoalRequest,
  goalTitleFrom,
  isQuestionNotGoal,
  needsNoOpeningSearch,
  statesANeed,
  instructionNames,
  instructionNeed,
  instructionQuestion,
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

  /**
   * THE TEN THIS GUARD SILENTLY COST, read out of `conversations` on
   * 20 September — every string below is one somebody really typed in the
   * 62 hours after it shipped, and every one was denied the opening search.
   *
   * They are all the same shape: a need, and then the polite half-sentence
   * that says where to look. „Ask my network" and „ვინ მყავს ქსელში" are the
   * clause `ABOUT_MY_OWN_BASE_RE` exists to catch — and here they are asking
   * FOR the second-circle search, not instead of it.
   */
  it('keeps them when the owner names their network as the place to look', () => {
    expect(needsNoOpeningSearch('მჭირდება კარგი ფოტოგრაფი თბილისში, ვინ მყავს ქსელში')).toBe(false);
    expect(
      needsNoOpeningSearch('Find me a good dentist in Tbilisi who speaks English. Ask my network.'),
    ).toBe(false);
    expect(needsNoOpeningSearch('I need a plumber in Tbilisi. Please ask my contacts.')).toBe(
      false,
    );
    expect(
      needsNoOpeningSearch(
        'I want to get introduced to Netai Test 3. Who in my contacts can introduce me?',
      ),
    ).toBe(false);
    expect(
      needsNoOpeningSearch(
        'I need a good photographer in Tbilisi. Who do I have in my network, and who could introduce me?',
      ),
    ).toBe(false);
  });

  /**
   * And the three the guard was built for are untouched, because none of them
   * states a need. If this ever goes red the fix above has widened into the
   * bug it replaced, and the ~17-second tax on „ვინ მყავს თბილისში?" is back.
   */
  it('still skips the three it was built for, which carry no need', () => {
    expect(needsNoOpeningSearch('ვინ მყავს თბილისში?')).toBe(true);
    expect(needsNoOpeningSearch('How many contacts do I have in my network?')).toBe(true);
    expect(needsNoOpeningSearch('What is Netai and how much does it cost?')).toBe(true);
  });
});

/**
 * The seat, 17 September: „a goal opened from the goal box still gets the raw
 * sentence as its title (goal 4885, 83 characters with the greeting), because
 * the SERVER writes that title before the model runs. Our prompt cannot reach
 * it." It is also what the stop line quotes back.
 */
describe('a greeting is not part of the goal', () => {
  it('drops it from the front of goal 4885’s own first message', () => {
    const title = goalTitleFrom(
      'გამარჯობა, მაქვს კონსერვების საწარმო, მაგრამ მიჭირს მარკეტინგში, ' +
        'ამისთვის მჭირდება კომპანია რომელიც დამეხმარება ქემფეინებში',
    );

    expect(title.startsWith('გამარჯობა')).toBe(false);
    expect(title).toContain('კონსერვების საწარმო');
  });

  it('drops it in the other languages people write in', () => {
    expect(goalTitleFrom('Hello, I need a wedding photographer in Kutaisi')).toBe(
      'I need a wedding photographer in Kutaisi',
    );
    expect(goalTitleFrom('Привет, нужен фотограф')).toBe('нужен фотограф');
  });

  it('leaves a greeting that is the WHOLE message, rather than an empty title', () => {
    expect(goalTitleFrom('გამარჯობა')).toBe('გამარჯობა');
  });

  it('does not touch the word in the middle of a sentence', () => {
    expect(goalTitleFrom('I need someone to say hi to the mayor')).toContain('hi');
  });
});

/** 3896 (LM-005, 2 of 2): „find" in the imperative is a need, so the goal opens and the members are asked. */
describe('„იპოვე" states a need', () => {
  it('opens a goal for the tester’s line', () => {
    expect(looksLikeGoalRequest('იპოვე კარგი ვეტერინარი თბილისში, ჩემს ნაცნობებს ჰკითხე.')).toBe(
      true,
    );
  });

  it('reads „მიპოვე" and „მომიძებნე" the same way', () => {
    expect(statesANeed('მიპოვე კარგი სანტექნიკოსი')).toBe(true);
    expect(statesANeed('მომიძებნე ბუღალტერი ვაკეში')).toBe(true);
  });

  it('leaves „I found" and „they found" alone', () => {
    expect(statesANeed('ვიპოვე კარგი ვეტერინარი, მადლობა')).toBe(false);
    expect(statesANeed('მეგობრებმა იპოვეს ვეტერინარი')).toBe(false);
  });
});

/** 3928 (GP-052 step 3): a chain of names is read whole. */
describe('an instruction that names several people', () => {
  it('reads both names and leaves no question when none follows', () => {
    const line = 'სანტექნიკოსი მჭირდება, ჰკითხე ნიკა დამხმარე-ას და სოფო დამხმარე-ბს.';
    expect(instructionNames(line)).toEqual(['ნიკა დამხმარე-ა', 'სოფო დამხმარე-ბ']);
    expect(instructionQuestion(line)).toBeNull();
    expect(instructionNeed(line)).toBe('სანტექნიკოსი მჭირდება');
  });

  it('reads „X-სა და Y-ს", a comma list, and English „and"', () => {
    expect(instructionNames('ჰკითხე ნიკასა და სოფოს, იცნობენ თუ არა სანტექნიკოსს?')).toEqual([
      'ნიკა',
      'სოფო',
    ]);
    expect(instructionNames('ჰკითხე ნიკას, სოფოს და ლევანს იციან თუ არა')).toEqual([
      'ნიკა',
      'სოფო',
      'ლევან',
    ]);
    expect(instructionNames('ask Nika and Sofo whether they know a plumber')).toEqual([
      'Nika',
      'Sofo',
    ]);
  });

  it('keeps one name and its question when a comma opens the question', () => {
    const line = 'ჰკითხე გიგა ტესტაძეს, იცნობს თუ არა კარგ ნოტარიუსს';
    expect(instructionNames(line)).toEqual(['გიგა ტესტაძე']);
    expect(instructionQuestion(line)).toBe('იცნობს თუ არა კარგ ნოტარიუსს');
  });

  it('never takes a name before the verb for the need', () => {
    expect(instructionNeed('ნინოს ჰკითხე, იცნობს თუ არა იურისტს')).toBeNull();
  });
});
