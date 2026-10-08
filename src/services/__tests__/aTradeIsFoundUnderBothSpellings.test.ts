import { buildMeaningWordGroups, withoutAgentEnding } from '../tools/transliterate';

/** 2675: „სანტექნიკი" and „სანტექნიკოსი" are one trade. */
describe('aTradeIsFoundUnderBothSpellings', () => {
  it('takes the agent ending off a long Georgian stem only', () => {
    expect(withoutAgentEnding('სანტექნიკოს')).toBe('სანტექნიკ');
    expect(withoutAgentEnding('ნიკოს')).toBeNull();
    expect(withoutAgentEnding('santeknikos')).toBeNull();
  });

  it('searches the shorter stem for „სანტექნიკოსი"', () => {
    const [group] = buildMeaningWordGroups('სანტექნიკოსი');
    expect(group.some((term) => /^santeknik$|^სანტექნიკ$/u.test(term))).toBe(true);
  });
});
