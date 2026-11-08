import { namedStepCaption } from '../runLanguage';
import { forwardedRequestOpening } from '../introOpening';

/**
 * Tester's report 8 Nov: „✉️ Gela Melia-ის ასისტენტს ვწერ…" and „Erekle
 * Rostomashvili-ს აინტერესებს…" — names saved in Latin letters inside Georgian text.
 */
describe('a person’s name in Georgian text', () => {
  it('is shown in Georgian letters in the step caption', () => {
    const caption = namedStepCaption('ask_contact', { contact_name: 'Gela Melia' }, 'ka');
    expect(caption).toContain('გელა მელია');
    expect(caption).not.toContain('Gela');
  });

  it('leaves search words as they were typed', () => {
    const caption = namedStepCaption('search_by_tag', { tag_query: 'fish farm' }, 'ka');
    expect(caption).toContain('fish farm');
  });

  it('keeps Latin letters in an English caption', () => {
    const caption = namedStepCaption('ask_contact', { contact_name: 'Gela Melia' }, 'en');
    expect(caption).toContain('Gela Melia');
  });

  it('is in Georgian letters in a request passed on', () => {
    const ka = forwardedRequestOpening('ka', 'Nana', 'Erekle Rostomashvili', 'Gigi', null);
    expect(ka).not.toMatch(/[A-Za-z]{3,}/);
  });
});
