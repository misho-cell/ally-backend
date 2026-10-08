import { askOpeningParts } from '../askOpening';

/** 2773: „ანა საცდელაძე's assistant is asking" — Georgian letters in an English frame. */
describe('anEnglishFrameNamesInLatin', () => {
  it('writes a Georgian name in Latin letters outside Georgian', () => {
    const parts = askOpeningParts('en', 'ანა საცდელაძე', null);
    expect(parts.first).toMatch(/^[A-Z][a-z]+ [A-Z][a-z]+'s assistant is asking:$/u);
    expect(parts.first).not.toMatch(/[ა-ჺ]/u);
  });

  it('keeps the name as it is in a Georgian frame, and a Latin name everywhere', () => {
    expect(askOpeningParts('ka', 'ანა საცდელაძე', null).first).toContain('ანა');
    expect(askOpeningParts('en', 'Ana Test', null).first).toBe("Ana Test's assistant is asking:");
  });
});
