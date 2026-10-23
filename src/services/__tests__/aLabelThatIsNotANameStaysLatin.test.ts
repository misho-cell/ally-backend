/**
 * #7231 (tester 73758): „Mechanic BMW service" came out „მეჩანიც BMW სერვიცის".
 * Names go into Georgian script (D859); other labels keep the owner's Latin.
 */
import { georgianScriptName, readsAsAName } from '../georgianScriptName';

describe('only a label that reads as a name is put into Georgian script', () => {
  it('keeps an English description as the owner wrote it', () => {
    expect(georgianScriptName('Mechanic BMW service')).toBe('Mechanic BMW service');
    expect(georgianScriptName('Iphone')).toBe('Iphone');
  });

  it('still writes a name in Georgian script', () => {
    expect(georgianScriptName('Tamuna Kovziridze')).not.toMatch(/[A-Za-z]/u);
    expect(readsAsAName('Ketevan Khuntsaria')).toBe(true);
    expect(readsAsAName('Nodar Baghishvili')).toBe(true);
  });

  it('drops „Ally" whichever way the label goes', () => {
    expect(georgianScriptName('Mechanic BMW service Ally')).toBe('Mechanic BMW service');
    expect(georgianScriptName('Tamuna Kovziridze Ally')).not.toContain('Ally');
  });

  it('does not treat lower-case words with a surname-like ending as a name', () => {
    expect(readsAsAName('social media')).toBe(false);
  });

  // #7231 retest (tester 73766): a name, then the owner's own description.
  it('writes the name in Georgian and leaves the description as written', () => {
    expect(georgianScriptName('Levan BMW mechanic')).toBe(
      `${georgianScriptName('Levan')} BMW mechanic`,
    );
    expect(georgianScriptName('Nana dentist')).toBe(`${georgianScriptName('Nana')} dentist`);
    expect(georgianScriptName('Levan BMW mechanic')).not.toMatch(/მეჩანიც/u);
  });

  it('still writes a first name and its surname both in Georgian', () => {
    expect(georgianScriptName('Giorgi Turashvili')).not.toMatch(/[A-Za-z]/u);
  });
});
