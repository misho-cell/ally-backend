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
});
