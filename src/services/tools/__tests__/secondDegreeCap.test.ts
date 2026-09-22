import { cappedGroups } from '../searchSecondDegree';

/**
 * Ticket 20 row 108 — the ceiling on how much work one query may ask for.
 *
 * The ceiling is a BACKSTOP, not a performance tuning knob, and it took two
 * wrong values to learn that. My cost curve was measured warm; production's
 * first second-circle call of a run is cold and costs roughly twice what the
 * pattern count predicts (goal 4621: 9 patterns, 17.5 s). At 9 the cap also
 * started taking things it should not — goal 4623's properly distilled
 * „ქორწილის ფოტოგრაფი ქუთაისი" is ten patterns, and the cap threw away the
 * city.
 *
 * Fifteen: high enough that a distilled query is never touched, low enough that
 * Ninia's 51-pattern sentence cannot reach the database.
 *
 * The first version of this counted WORDS and kept the first eight. Goal 4522
 * showed both halves of that to be wrong within the hour:
 *
 *   13:34:49 [second-degree] user 501: query had 17 word groups (51 patterns);
 *            searching the first 8
 *
 * Eight Georgian words is about twenty-four patterns, and the eight it kept
 * were the greeting and the filler.
 */
const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
beforeEach(() => warn.mockClear());
afterAll(() => warn.mockRestore());

/** A Georgian word as the splitter really produces it: three spellings. */
function word(w: string): string[] {
  return [w, `${w}-latin`, `${w}-drift`];
}

describe('cappedGroups', () => {
  it('leaves an ordinary query completely alone', () => {
    // „ქორწილის ფოტოგრაფი" is two words, six patterns: the cap must be
    // invisible to every shape anybody actually searches with.
    const two = [word('ქორწილის'), word('ფოტოგრაფი')];

    expect(cappedGroups(two, '501')).toBe(two);
    expect(warn).not.toHaveBeenCalled();
  });

  it('never touches a distilled query, which is what the distiller produces', () => {
    // Goal 4623's distillation was „ქორწილის ფოტოგრაფი ქუთაისი" — ten patterns,
    // and the first version of this cap threw the city away.
    const distilled = ['ქორწილის', 'ფოტოგრაფი', 'ქუთაისი'].map(word);

    expect(cappedGroups(distilled, '501')).toBe(distilled);
    expect(warn).not.toHaveBeenCalled();
  });

  /**
   * 22 September — THIS USED TO EXPECT THE SIXTH WORD TO BE THROWN AWAY, and
   * that expectation was the bug arriving through the back door.
   *
   * Closing row 222's asymmetry gave Latin words two more readings, and
   * „marketing agency" went from fourteen patterns to seventeen — so the
   * old rule dropped „agency" and searched a two-word query for one word.
   * That is row 110's own failure, and the comment on MAX_QUERY_PATTERNS
   * promised it could not happen to a two-to-four-word query.
   *
   * The budget is spent on WORDS first and spellings after.
   */
  it('keeps every word and trims the spellings instead', () => {
    const six = ['ერთი', 'ორი', 'სამი', 'ოთხი', 'ხუთი', 'ექვსი'].map(word);

    const kept = cappedGroups(six, '501');

    expect(kept).toHaveLength(6);
    expect(kept.flat()).toHaveLength(15);
    // Every word is still searched for, under its own primary spelling.
    expect(kept.map((g) => g[0])).toEqual(['ერთი', 'ორი', 'სამი', 'ოთხი', 'ხუთი', 'ექვსი']);
  });

  it('drops the words that can never be anybody’s tag, before it counts', () => {
    // Ninia's sentence in miniature: the greeting and „I need" are pure cost.
    const groups = [word('გამარჯობა'), word('მჭირდება'), word('ფოტოგრაფი')];

    const kept = cappedGroups(groups, '501');

    expect(kept.map((g) => g[0])).toEqual(['ფოტოგრაფი']);
  });

  /**
   * WHAT THIS COSTS, said rather than buried. A word searched in Georgian but
   * not in its Latin spelling finds fewer of the people who match it — that is
   * why this test was written, and it is still true.
   *
   * The two harms are now ranked instead of one of them being invisible.
   * Losing a WORD takes it out of `word_hits` altogether, so the intersection
   * that makes „Dachi Axel" find one person rather than the hundred and fifty
   * who carry „Axel" is gone. Losing a SPELLING leaves the word searched and
   * counted, with less recall on it. The first is worse, so spellings go first.
   *
   * A query that FITS is still never touched, which is every ordinary one.
   */
  it('leaves every spelling alone when the query fits', () => {
    const five = ['ერთი', 'ორი', 'სამი', 'ოთხი', 'ხუთი'].map(word);

    expect(cappedGroups(five, '501')).toBe(five);
    for (const group of cappedGroups(five, '501')) expect(group).toHaveLength(3);
  });

  it('spends the budget on the words first, so none is searched blind', () => {
    // Eight words is twenty-four patterns; every one keeps its primary form.
    const eight = ['ა', 'ბ', 'გ', 'დ', 'ე', 'ვ', 'ზ', 'თ'].map(word);

    const kept = cappedGroups(eight, '501');

    expect(kept).toHaveLength(8);
    expect(kept.every((g) => g.length >= 1)).toBe(true);
    expect(kept.flat().length).toBeLessThanOrEqual(15);
  });

  it('still searches for something when the first word alone is over budget', () => {
    const huge = [Array.from({ length: 20 }, (_, i) => `variant${i}`)];

    expect(cappedGroups(huge, '501')).toHaveLength(1);
  });

  it('searches the real words when the query is NOTHING but filler', () => {
    // „გამარჯობა, მინდა" is a bad query, but answering it with an empty search
    // is worse than answering it badly — and silently searching for nothing is
    // worse than both.
    const filler = [word('გამარჯობა'), word('მინდა')];

    expect(cappedGroups(filler, '501')).toHaveLength(2);
    expect(warn).not.toHaveBeenCalled();
  });

  it('SAYS what it kept when it cuts, not just that it cut', () => {
    cappedGroups([word('გამარჯობა'), word('მაქვს'), word('ფოტოგრაფი')], '501');

    expect(warn).toHaveBeenCalledTimes(1);
    const line = String(warn.mock.calls[0][0]);
    expect(line).toContain('3 word groups');
    expect(line).toContain('ფოტოგრაფი');
  });
});
