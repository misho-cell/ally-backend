/**
 * Misho, 23 Oct („ყველა კი", recommendation 8): the plan heading names the
 * target from the planned go-between's label (#6899), but only the name part
 * of it — never the go-between's own words about the person (#7231).
 */
import { namePartOfLabel } from '../georgianScriptName';

describe('the name part of a go-between label', () => {
  it('drops the go-between description after a first name', () => {
    expect(namePartOfLabel('ლევან ელექტრიკოსი')).toBe('ლევან');
    expect(namePartOfLabel('Levan BMW mechanic')).toBe('Levan');
  });

  it('keeps a surname that follows the first name', () => {
    expect(namePartOfLabel('ლევან მოსეშვილი')).toBe('ლევან მოსეშვილი');
    expect(namePartOfLabel('Levan Moseshvili designer')).toBe('Levan Moseshvili');
  });

  it('gives nothing for a label that holds no name', () => {
    expect(namePartOfLabel('Mechanic BMW service')).toBeNull();
    expect(namePartOfLabel('')).toBeNull();
  });
});
