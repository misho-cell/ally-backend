import { georgianScriptName } from '../georgianScriptName';

/** #7728 retest (tester 76702, 3/5): „გიო kipiani" kept its Latin surname. */
describe('a name begun in Georgian', () => {
  it('gets its Latin surname in Georgian letters', () => {
    expect(georgianScriptName('გიო kipiani')).toBe('გიო კიპიანი');
  });

  it('keeps a Latin word that is not a surname', () => {
    expect(georgianScriptName('ლევანი BMW')).toBe('ლევანი BMW');
  });

  it('leaves an all-Georgian name as it is', () => {
    expect(georgianScriptName('ნინო ბერიძე')).toBe('ნინო ბერიძე');
  });
});
