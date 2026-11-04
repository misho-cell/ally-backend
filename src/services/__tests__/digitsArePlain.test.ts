import { withPlainDigits } from '../noScores';

/** 3236 (ME-032, seat 179995): the owner was given a score, once in Gujarati digits. */
describe('digits are 0-9', () => {
  it('turns Gujarati, Persian and Arabic-Indic digits into 0-9', () => {
    expect(withPlainDigits('૮/૧૦')).toBe('8/10');
    expect(withPlainDigits('۱۲ ოქტომბერი')).toBe('12 ოქტომბერი');
    expect(withPlainDigits('٣ დღეში')).toBe('3 დღეში');
    expect(withPlainDigits('13 ოქტომბერი')).toBe('13 ოქტომბერი');
  });
});
