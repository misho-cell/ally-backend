import { readFileSync } from 'fs';
import { join } from 'path';
import { asksAboutTheName, registeredNameOnlyWhenAsked } from '../registeredNameOnlyWhenAsked';

const FOUND = {
  found: true,
  results: [
    { name: 'Nino', saved_as: 'Nino', registered_name: 'Registered Spelling' },
    { name: 'Other', saved_as: 'Other' },
  ],
};

/** #8528 (the tester's 81216 / 81314, case 61) beside #1355 (surname spelling). */
describe('a member’s registered name reaches the model only for a name question', () => {
  it('drops registered_name when the owner asks who someone is', () => {
    const out = registeredNameOnlyWhenAsked(
      FOUND,
      'ვინ არის ნინო ჩემს კონტაქტებში? რას საქმიანობს?',
    );
    expect(out.results).toEqual([
      { name: 'Nino', saved_as: 'Nino' },
      { name: 'Other', saved_as: 'Other' },
    ]);
  });

  it('keeps registered_name when the owner asks how the surname is spelled (#1355)', () => {
    expect(registeredNameOnlyWhenAsked(FOUND, 'ნინოს გვარი ზუსტად როგორ იწერება?')).toBe(FOUND);
    expect(registeredNameOnlyWhenAsked(FOUND, 'what is his surname exactly?')).toBe(FOUND);
  });

  it('reads name questions in Georgian, English and Russian', () => {
    expect(asksAboutTheName('რა ჰქვია მას სრულად?')).toBe(true);
    expect(asksAboutTheName('how do you spell it')).toBe(true);
    expect(asksAboutTheName('как его фамилия?')).toBe(true);
    expect(asksAboutTheName('ვინ არის ელექტრიკოსი?')).toBe(false);
  });

  it('leaves a result without rows untouched', () => {
    const empty = { found: false, query: 'x' };
    expect(registeredNameOnlyWhenAsked(empty, 'ვინ არის?')).toBe(empty);
  });

  it('is applied to both answers of the name search in the chat', () => {
    const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
    const at = chat.indexOf("case 'search_contact_by_name': {");
    const block = chat.slice(at, chat.indexOf("case 'search_by_tag': {", at));
    expect(block.match(/registeredNameOnlyWhenAsked\(byName, ownerLine\)/gu)).toHaveLength(2);
  });
});
