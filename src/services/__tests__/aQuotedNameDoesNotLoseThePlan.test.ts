import { escapeInnerQuotes, repairedPlanJson } from '../planJsonRepair';

/** #8617: a firm's name in unescaped quotes inside a plan value lost the plan. */
describe('a quoted name inside a plan value (#8617)', () => {
  it('mends the plan instead of losing it', () => {
    const text =
      '{"solved_when": "შეხვედრა "Daily" (შპს) დირექტორთან", "routes": [{"name": "ქსელი", "status": "waiting"}]}';
    expect(() => JSON.parse(text)).toThrow();
    expect(repairedPlanJson(text)).toEqual({
      solved_when: 'შეხვედრა "Daily" (შპს) დირექტორთან',
      routes: [{ name: 'ქსელი', status: 'waiting' }],
    });
  });

  it('leaves valid JSON as it is, escapes included', () => {
    const text = '{"a": "x \\"y\\" z", "b": ["c", "d"], "e": {"f": "g"}}';
    expect(escapeInnerQuotes(text)).toBe(text);
  });

  it('gives up rather than guessing on text that is not a plan', () => {
    expect(repairedPlanJson('{"a": ')).toBeUndefined();
  });
});
