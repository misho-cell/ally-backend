import { incomingRequestOpening } from '../introOpening';

/**
 * The tester's 39469: the introduction said „<asker> asks you" and showed
 * „his message: „…"" — words he never typed. #1420 and D648: it is the
 * assistant's request, and what it is about is said plainly.
 */
describe('an introduction request is the assistant’s', () => {
  it('names the asker’s assistant and quotes nothing (ka)', () => {
    const text = incomingRequestOpening('ka', 'გიორგი', 'ნინო', 'დიზაინერია', false);
    expect(text).toContain('**გიორგის ასისტენტი** გთხოვს, გიორგი გააცნო **ნინოს**.');
    expect(text).toContain('რაზეა საქმე: დიზაინერია');
    expect(text).not.toContain('"');
    expect(text).not.toContain('მისი შეტყობინება');
  });

  it('does the same in English, and in the direct case', () => {
    expect(incomingRequestOpening('en', 'Giorgi', 'Nino', 'a designer', false)).toContain(
      "**Giorgi's assistant** is asking you to introduce Giorgi to **Nino**.",
    );
    expect(incomingRequestOpening('en', 'Giorgi', 'you', null, true)).toBe(
      "Hello! **Giorgi's assistant** is writing: Giorgi would like to meet you.\n\nWill you say yes?",
    );
  });
});
