import { buttonLanguageRefusal, labelInAnotherLanguage } from '../buttonLetters';

/** The tester's 64517 (56218): Georgian buttons in an English conversation. */
describe('a button in another language than the conversation', () => {
  it('is caught when Georgian letters sit on a button in an English chat', () => {
    expect(labelInAnotherLanguage(['კი, სთხოვე ლევანს გაცნობა', 'არა, ჯერ არა'], 'en')).toBe(
      'კი, სთხოვე ლევანს გაცნობა',
    );
  });

  it('lets a Latin word stand on a Georgian button, and English buttons in English', () => {
    expect(labelInAnotherLanguage(['Excel', 'კი, ვიცნობ'], 'ka')).toBeNull();
    expect(labelInAnotherLanguage(['Yes, ask Levan', 'Not yet'], 'en')).toBeNull();
  });

  it('asks for the buttons again in the conversation’s language', () => {
    expect(buttonLanguageRefusal('არა, ჯერ არა', 'en')).toContain('in English');
  });
});
