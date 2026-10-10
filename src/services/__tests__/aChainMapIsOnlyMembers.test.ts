import {
  CandidatePath,
  chainMapOf,
  ChainLinkRole,
  ChainLinkState,
  MAX_CHAIN_HOPS,
  MAX_CHAIN_MAPS,
  offerable,
  rankedPaths,
} from '../chainMap';

/** Task 1849, stage one (§127): the map of a path to a named person. */
describe('which paths may be offered', () => {
  const members = new Set(['a', 'b', 'c']);
  const isMember = (p: string): boolean => members.has(p);

  it('only paths whose every person in the middle is a member and not blocked', () => {
    expect(offerable(['a', 'b', 'c'], isMember, () => false)).toBe(true);
    expect(offerable(['a', 'x'], isMember, () => false)).toBe(false);
    expect(offerable(['a', 'b'], isMember, (p) => p === 'b')).toBe(false);
    expect(offerable([], isMember, () => false)).toBe(false);
  });

  it('reaches five people at most: the owner, three members, the target', () => {
    expect(MAX_CHAIN_HOPS).toBe(4);
  });
});

describe('the order the maps come in', () => {
  it('fewest steps first, then the warmest, and no more than the maps shown', () => {
    const paths: CandidatePath[] = [
      { middle: ['a', 'b'], warmSteps: 3 },
      { middle: ['c'], warmSteps: 0 },
      { middle: ['d'], warmSteps: 2 },
      { middle: ['e', 'f', 'g'], warmSteps: 4 },
      { middle: ['h', 'i'], warmSteps: 1 },
    ];
    const ranked = rankedPaths(paths);
    expect(ranked.map((p) => p.middle[0])).toEqual(['d', 'c', 'a']);
    expect(ranked).toHaveLength(MAX_CHAIN_MAPS);
  });
});

describe('one map, link by link', () => {
  it('is the owner, the members in order with the first one next, and the target', () => {
    const map = chainMapOf(
      { middle: ['a', 'b'], warmSteps: 1 },
      (p) => ({ id: `c_${p}`, name: p.toUpperCase(), isMember: true }),
      { id: 'c_t', name: 'T', isMember: false },
    );
    expect(map.hops).toBe(3);
    expect(map.links.map((l) => [l.role, l.state, l.name])).toEqual([
      [ChainLinkRole.You, null, null],
      [ChainLinkRole.Bridge, ChainLinkState.Next, 'A'],
      [ChainLinkRole.Bridge, ChainLinkState.NotContacted, 'B'],
      [ChainLinkRole.Target, ChainLinkState.NotContacted, 'T'],
    ]);
  });
});
