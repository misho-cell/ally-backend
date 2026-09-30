jest.mock('../../db/postgres/client', () => ({ __esModule: true, query: jest.fn(), default: {} }));

import { nameOnlyFromLabel } from '../labelReader.service';

/**
 * Row 296: a second-circle person's „name" was the bridge's whole saved label,
 * and a reply told the owner how the bridge had saved them („…'s lawyer").
 * Only the name words survive now.
 */
describe("a bridge's saved label is reduced to the person's name", () => {
  it('drops the profession and whose it is', () => {
    const shown = nameOnlyFromLabel('Nino Beridze advokati');
    expect(shown).toBe('Nino Beridze');
  });

  it('drops a relation word', () => {
    expect(nameOnlyFromLabel('deda Nino')).toBe('Nino');
  });

  it('drops a word it does not recognise, which is where an insult lives', () => {
    expect(nameOnlyFromLabel('Levani gizhi')).toBe('Levani');
  });

  it('keeps the spelling the saver typed', () => {
    expect(nameOnlyFromLabel('ნინო ბერიძე')).toBe('ნინო ბერიძე');
  });

  it('gives no name at all when the label holds none', () => {
    expect(nameOnlyFromLabel('santeqnikosi')).toBeNull();
    expect(nameOnlyFromLabel('💙')).toBeNull();
    expect(nameOnlyFromLabel(null)).toBeNull();
  });
});

describe("the report's own shape — somebody else's lawyer", () => {
  it('keeps the person and drops whose lawyer they are', () => {
    expect(nameOnlyFromLabel('Nino Giorgis advokati')).toBe('Nino');
    expect(nameOnlyFromLabel('ნინო გიორგის ადვოკატი')).toBe('ნინო');
  });

  it('drops whose relative they are', () => {
    expect(nameOnlyFromLabel('Levani Mamukas dzma')).toBe('Levani');
  });
});
