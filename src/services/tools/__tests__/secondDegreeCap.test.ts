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

  it('counts PATTERNS, not words', () => {
    const six = ['ერთი', 'ორი', 'სამი', 'ოთხი', 'ხუთი', 'ექვსი'].map(word);

    // Five words are fifteen patterns and fit exactly; the sixth makes eighteen.
    expect(cappedGroups(six, '501')).toHaveLength(5);
  });

  it('drops the words that can never be anybody’s tag, before it counts', () => {
    // Ninia's sentence in miniature: the greeting and „I need" are pure cost.
    const groups = [word('გამარჯობა'), word('მჭირდება'), word('ფოტოგრაფი')];

    const kept = cappedGroups(groups, '501');

    expect(kept.map((g) => g[0])).toEqual(['ფოტოგრაფი']);
  });

  it('never drops half a word’s spellings', () => {
    // A word searched in Georgian but not in its Latin spelling finds half the
    // people who match it, and reads as a ranking bug for weeks.
    const kept = cappedGroups(['ერთი', 'ორი', 'სამი', 'ოთხი', 'ხუთი'].map(word), '501');
    expect(kept.length).toBeGreaterThan(0);

    for (const group of kept) expect(group).toHaveLength(3);
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
