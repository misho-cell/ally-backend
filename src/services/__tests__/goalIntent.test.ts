import {
  goalTitleFrom,
  instructionNames,
  instructionNeed,
  instructionQuestion,
  looksLikeContactInstruction,
} from '../goalIntent';

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

/**
 * The founder's ruling of 17 September: „look at what the person typed before
 * running anything. A question skips web_search:opening and
 * search_second_degree:opening entirely; a real goal keeps both."
 *
 * From the battery run of 19:00-19:36 — every string below is one somebody
 * actually typed that night, not an invented example.
 */
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

  it('never takes the last word of the sentence before the verb as the person (3928 run 2)', () => {
    const line =
      'სანტექნიკოსი მჭირდება საბურთალოზე, აბაზანაში მილი გამდის. ჰკითხე ირაკლი ტესტაძეს და მამუკა ტესტაძეს.';
    expect(instructionNames(line)).toEqual(['ირაკლი ტესტაძე', 'მამუკა ტესტაძე']);
    expect(instructionNeed(line)).toBe('სანტექნიკოსი მჭირდება საბურთალოზე, აბაზანაში მილი გამდის.');
    expect(instructionNames('პრობლემა მაქვს, ჰკითხე ნიკას იცნობს თუ არა ხელოსანს')).toEqual([
      'ნიკა',
    ]);
    expect(instructionNames('გიას ვთხოვ ამ კვირაში შეხვედრის დანიშვნას')).toEqual(['გია']);
  });

  it('keeps one name and its question when a comma opens the question', () => {
    const line = 'ჰკითხე გიგა ტესტაძეს, იცნობს თუ არა კარგ ნოტარიუსს';
    expect(instructionNames(line)).toEqual(['გიგა ტესტაძე']);
    expect(instructionQuestion(line)).toBe('იცნობს თუ არა კარგ ნოტარიუსს');
  });

  it('never takes a name before the verb for the need', () => {
    expect(instructionNeed('ნინოს ჰკითხე, იცნობს თუ არა იურისტს')).toBeNull();
  });

  it("never takes the owner's yes for the need (1919, thread 51845)", () => {
    expect(instructionNeed('კი, მიწერე ნინოს')).toBeNull();
    expect(instructionNeed('ჰო კარგი, ჰკითხე ლიკას')).toBeNull();
    expect(instructionNeed('yes, ask Nino')).toBeNull();
    expect(instructionNeed('კარგი მზარეული მჭირდება, ჰკითხე ნინოს')).toBe(
      'კარგი მზარეული მჭირდება',
    );
  });
});

/** 3961 (QA-015 step 3, seat 181480): „set up a meeting with X" is an instruction to X. */
describe('a meeting the owner asks to set up', () => {
  const LINE = 'შეხვედრა დამინიშნე ნანული მოგონილთან ხვალ 3 საათზე.';

  it('is an instruction naming the person in „-თან", asking the meeting itself', () => {
    expect(looksLikeContactInstruction(LINE)).toBe(true);
    expect(instructionNames(LINE)).toEqual(['ნანული მოგონილ']);
    expect(instructionQuestion(LINE)).toBe('შეხვედრა ხვალ 3 საათზე.');
  });

  it('keeps the meeting noun out of the name, and asks for a meeting when nothing else is said', () => {
    expect(instructionNames('დამინიშნე შეხვედრა ნინოსთან ხვალ')).toEqual(['ნინო']);
    expect(instructionNames('შემახვედრე გიორგისთან')).toEqual(['გიორგი']);
    expect(instructionQuestion('შემახვედრე გიორგისთან')).toBe('შეხვედრა');
  });

  it('reads the English form', () => {
    const line = 'set up a meeting with Nanuli Mogonili tomorrow at 3';
    expect(instructionNames(line)).toEqual(['Nanuli Mogonili']);
    expect(instructionQuestion(line)).toBe('a meeting tomorrow at 3');
  });
});
