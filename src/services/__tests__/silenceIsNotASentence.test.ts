jest.mock('../../db/postgres/client', () => ({ __esModule: true, query: jest.fn(), default: {} }));

import { echoesThePrimer } from '../speech.service';

/** #6205 (Ninia's phone, 20 Oct): silence came back as „გამარჯობა" and the weather. */
describe('a transcript of silence', () => {
  it('is the primer’s own words, and is not something the person said', () => {
    expect(echoesThePrimer('გამარჯობა. დღეს ამინდი კარგია.', 'ka')).toBe(true);
    expect(echoesThePrimer('ერთი წუთით მოიცადე, ახლავე გეტყვი', 'ka')).toBe(true);
  });

  it('lets a short real greeting through', () => {
    expect(echoesThePrimer('გამარჯობა', 'ka')).toBe(false);
    expect(echoesThePrimer('დიდი მადლობა', 'ka')).toBe(false);
  });

  it('lets through anything with a word of the person’s own', () => {
    expect(echoesThePrimer('გამარჯობა, ხვალ ბუღალტერი მჭირდება', 'ka')).toBe(false);
  });

  it('judges only a language that has a primer', () => {
    expect(echoesThePrimer('გამარჯობა. დღეს ამინდი კარგია.', undefined)).toBe(false);
  });
});
