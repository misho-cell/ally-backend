import { readFileSync } from 'fs';
import { join } from 'path';
import { ABOUT_THE_NAME_FIELD, registeredNameOnlyWhenAsked } from '../registeredNameOnlyWhenAsked';

const FOUND = {
  found: true,
  results: [
    { name: 'Nino', saved_as: 'Nino', registered_name: 'Registered Spelling' },
    { name: 'Other', saved_as: 'Other' },
  ],
};

/**
 * #8528 (the tester's 81216 / 81314, case 61) beside #1355 (surname spelling).
 * #8779 group 4: whether the owner asks about the name is the model's reading,
 * passed as the search's `about_the_name` — no word list.
 */
describe('a member’s registered name reaches the model only for a name question', () => {
  it('drops registered_name when the run did not say the owner asks about the name', () => {
    const stripped = [
      { name: 'Nino', saved_as: 'Nino' },
      { name: 'Other', saved_as: 'Other' },
    ];
    expect(registeredNameOnlyWhenAsked(FOUND, false).results).toEqual(stripped);
    expect(registeredNameOnlyWhenAsked(FOUND, undefined).results).toEqual(stripped);
    expect(registeredNameOnlyWhenAsked(FOUND, 'true').results).toEqual(stripped);
  });

  it('keeps registered_name when the run says the owner asks about the name (#1355)', () => {
    expect(registeredNameOnlyWhenAsked(FOUND, true)).toBe(FOUND);
  });

  it('leaves a result without rows untouched', () => {
    const empty = { found: false, query: 'x' };
    expect(registeredNameOnlyWhenAsked(empty, false)).toBe(empty);
  });

  it('is the search’s own argument, applied to both answers of the name search', () => {
    const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
    expect(ABOUT_THE_NAME_FIELD.type).toBe('boolean');
    expect(chat).toContain('about_the_name: ABOUT_THE_NAME_FIELD,');
    const at = chat.indexOf("case 'search_contact_by_name': {");
    const block = chat.slice(at, chat.indexOf("case 'search_by_tag': {", at));
    expect(block).toContain("const aboutTheName = input['about_the_name'];");
    expect(block.match(/registeredNameOnlyWhenAsked\(byName, aboutTheName\)/gu)).toHaveLength(2);
  });
});
