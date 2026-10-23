/**
 * Engagement chat 74153 (23 Oct, a real member registered under initials):
 * the welcome study searched the initials and saved an unrelated page.
 */
import { isWholeName, nameToResearch } from '../researchName';

describe('the name the registration research searches', () => {
  it('keeps a whole registered name', () => {
    expect(nameToResearch('Giorgi Kapanadze', [])).toBe('Giorgi Kapanadze');
  });

  it('takes the most common whole label for initials', () => {
    const labels = [
      { label: 'Gio', count: 5 },
      { label: 'გიორგი კაპანაძე', count: 3 },
      { label: 'Giorgi Kapanadze', count: 1 },
    ];
    expect(nameToResearch('G.K.', labels)).toBe('გიორგი კაპანაძე');
  });

  it('searches nothing when no whole name is known', () => {
    expect(nameToResearch('GK', [{ label: 'Gio', count: 4 }])).toBeNull();
  });

  it('does not take initials or a single first name for a whole name', () => {
    expect(isWholeName('G. K.')).toBe(false);
    expect(isWholeName('Giorgi')).toBe(false);
    expect(isWholeName('Ia Ok')).toBe(false);
  });
});
