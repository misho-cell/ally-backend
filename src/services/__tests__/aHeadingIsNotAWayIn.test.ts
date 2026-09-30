jest.mock('../../db/postgres/client', () => ({ __esModule: true, query: jest.fn(), default: {} }));

import { buildFromTheWebMessage, looksLikeAPersonOrFirm } from '../openingSearch.service';

/**
 * Row 281, the seat's 873: „• ადვოკატი — შენი კონტაქტი იქ: ნინო ადვოკატი".
 * The web „name" was a heading (a profession), and the phonebook lookup found
 * whoever is labelled with it.
 */
describe('a heading is not a way in', () => {
  it("refuses the seat's two headings", () => {
    expect(looksLikeAPersonOrFirm('ადვოკატი')).toBe(false);
    expect(looksLikeAPersonOrFirm('ადვოკატი / იურისტი')).toBe(false);
  });

  it('keeps leads shaped like a person or a firm', () => {
    expect(looksLikeAPersonOrFirm('Nini Elisashvili')).toBe(true);
    expect(looksLikeAPersonOrFirm('ნინო ბერიძე')).toBe(true);
    expect(looksLikeAPersonOrFirm('BLC Law Office')).toBe(true);
  });

  it('prints no way-in line for a heading, and no card when nothing true is left', () => {
    const onlyHeading = new Map([
      ['ადვოკატი', { kind: 'first_circle', who: 'ნინო ადვოკატი' }],
    ]) as never;
    expect(buildFromTheWebMessage(onlyHeading, 'ka')).toBeNull();
  });

  it('still prints a real lead with its contact', () => {
    const real = new Map([
      ['Nini Elisashvili', { kind: 'first_circle', who: 'Nini E.' }],
      ['ადვოკატი', { kind: 'first_circle', who: 'ნინო ადვოკატი' }],
    ]) as never;
    const card = buildFromTheWebMessage(real, 'en') ?? '';
    expect(card).toContain('• Nini Elisashvili — your contact there: Nini E.');
    expect(card).not.toContain('ადვოკატი');
  });
});
