import { allFictionalNumbers, FICTIONAL_RANGES_TEXT, isFictionalNumber } from '../fictionalNumbers';

/**
 * The seat's 873: the fictional block was full. The second block must be one
 * a numbering authority reserves for fiction — never a range where a real
 * person's number could be.
 */
describe('fictional numbers come only from ranges reserved for fiction', () => {
  it('accepts both reserved blocks, and only their slots', () => {
    expect(isFictionalNumber('+12025550100')).toBe(true);
    expect(isFictionalNumber('+12025550199')).toBe(true);
    expect(isFictionalNumber('+447700900000')).toBe(true);
    expect(isFictionalNumber('+447700900999')).toBe(true);
  });

  it('refuses the neighbours, which can belong to real people', () => {
    for (const phone of [
      '+12025551234', // the seat's proposed 555-1000 block — not reserved
      '+12025550200',
      '+447700901000',
      '+44770090000', // one digit short
      '+1202555012a',
      '+995551023432',
    ]) {
      expect(isFictionalNumber(phone)).toBe(false);
    }
  });

  it('offers 2,100 numbers, the old blocks first (third block 2 Oct)', () => {
    const all = allFictionalNumbers();
    expect(all).toHaveLength(2100);
    expect(all[1100]).toBe('+442079460000');
    expect(all[0]).toBe('+12025550100');
    expect(all[100]).toBe('+447700900000');
    expect(all.every(isFictionalNumber)).toBe(true);
  });

  it('names both blocks in a refusal', () => {
    expect(FICTIONAL_RANGES_TEXT).toBe(
      '+12025550100–0199 or +447700900000–900999 or +442079460000–0999',
    );
  });
});
