import { cappedGroups, MAX_QUERY_WORD_GROUPS } from '../searchSecondDegree';

/**
 * Ticket 20 row 108 — the ceiling on how much work one query may ask for.
 *
 * Cost is (rows the bridges own) x (regexes), and only the second factor is
 * under anybody's control. Measured on 501 against the live base, tag half
 * alone: 6 regexes 3.1 s, 12 regexes 11.4 s. Ninia's marketing sentence made
 * 51, in a statement of 9,687 characters, and timed out at 15 s three times
 * today without returning one person.
 *
 * The real fix is upstream — the opening search sends the short phrase now.
 * This is the backstop for every other caller.
 */
const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
beforeEach(() => warn.mockClear());
afterAll(() => warn.mockRestore());

function groupsOf(n: number): string[][] {
  return Array.from({ length: n }, (_, i) => [`\\mword${i}`]);
}

describe('cappedGroups', () => {
  it('leaves an ordinary query completely alone', () => {
    // „ქორწილის ფოტოგრაფი" is two; „Dachi Axel" is two; the cap must be
    // invisible to every shape anybody actually searches with.
    const two = groupsOf(2);
    expect(cappedGroups(two, '501')).toBe(two);
    expect(warn).not.toHaveBeenCalled();
  });

  it('leaves a query sitting exactly on the cap alone', () => {
    const exact = groupsOf(MAX_QUERY_WORD_GROUPS);
    expect(cappedGroups(exact, '501')).toBe(exact);
    expect(warn).not.toHaveBeenCalled();
  });

  it('cuts a pasted sentence down, keeping the words it was given first', () => {
    const cut = cappedGroups(groupsOf(17), '501');

    expect(cut).toHaveLength(MAX_QUERY_WORD_GROUPS);
    expect(cut[0]).toEqual(['\\mword0']);
  });

  it('SAYS SO when it bites', () => {
    // A search that quietly looks for less than it was asked is the failure
    // this codebase keeps finding. It must be readable in the log.
    cappedGroups(groupsOf(17), '501');

    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toContain('17 word groups');
  });
});
