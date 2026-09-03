import { roundTo, SCORE_DECIMALS } from '../number';

describe('roundTo (ticket 9 task 31.4)', () => {
  it('kills the seventeen-digit tail the admin screens were showing', () => {
    // The exact value from the 2 September report.
    expect(roundTo(0.45 + 0.3 + 0.1 - 0.175)).toBe(0.675);
    expect(String(roundTo(0.6749999999999999))).toBe('0.675');
  });

  it('keeps enough decimals to order two close rows apart', () => {
    expect(SCORE_DECIMALS).toBeGreaterThanOrEqual(3);
    expect(roundTo(0.4104)).not.toBe(roundTo(0.4109));
  });

  it('leaves a clean number clean', () => {
    expect(roundTo(0.7)).toBe(0.7);
    expect(roundTo(0)).toBe(0);
    expect(roundTo(1)).toBe(1);
  });

  it('never returns NaN or Infinity to a screen', () => {
    expect(roundTo(Number.NaN)).toBe(0);
    expect(roundTo(Number.POSITIVE_INFINITY)).toBe(0);
  });
});
