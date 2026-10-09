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

  it('offers 3,100 numbers, the old blocks first (third block 2 Oct, fourth 3 Oct)', () => {
    const all = allFictionalNumbers();
    expect(all).toHaveLength(8100);
    expect(all[1100]).toBe('+442079460000');
    expect(all[2100]).toBe('+441614960000');
    expect(all[3099]).toBe('+441614960999');
    expect(all[0]).toBe('+12025550100');
    expect(all[100]).toBe('+447700900000');
    expect(all.every(isFictionalNumber)).toBe(true);
  });

  it('names every block in a refusal', () => {
    expect(FICTIONAL_RANGES_TEXT).toBe(
      '+12025550100–0199 or +447700900000–900999 or +442079460000–0999 or +441614960000–0999 or ' +
        '+441134960000–0999 or +441144960000–0999 or +441154960000–0999 or +441174960000–0999 or ' +
        '+441164960000–0999',
    );
  });

  it('takes the Manchester drama block exactly, and nothing beside it', () => {
    expect(isFictionalNumber('+441614960000')).toBe(true);
    expect(isFictionalNumber('+441614960999')).toBe(true);
    expect(isFictionalNumber('+441614961000')).toBe(false);
    expect(isFictionalNumber('+44161496000')).toBe(false);
  });

  /** 4 Oct, D623 / the tester's 1115: Leeds, Sheffield, Nottingham and Bristol. */
  it('takes the four new Ofcom drama blocks, exactly', () => {
    for (const area of ['113', '114', '115', '117']) {
      expect(isFictionalNumber(`+44${area}4960000`)).toBe(true);
      expect(isFictionalNumber(`+44${area}4960999`)).toBe(true);
      expect(isFictionalNumber(`+44${area}4961000`)).toBe(false);
    }
    expect(allFictionalNumbers()[7099]).toBe('+441174960999');
  });

  /** 9 Oct, ops 06:46Z — the tester blocked all night; Misho: „ნომრებით თქვენ გადაწყვიტეთ" (§110). Leicester. */
  it('takes the ninth Ofcom drama block, exactly', () => {
    expect(isFictionalNumber(`+44116${'4960000'}`)).toBe(true);
    expect(isFictionalNumber(`+44116${'4960999'}`)).toBe(true);
    expect(isFictionalNumber(`+44116${'4961000'}`)).toBe(false);
    expect(isFictionalNumber(`+44116${'4970000'}`)).toBe(false);
    expect(allFictionalNumbers()[8099]).toBe(`+44116${'4960999'}`);
  });
});
