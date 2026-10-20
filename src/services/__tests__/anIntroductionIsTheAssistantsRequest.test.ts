import { incomingRequestOpening } from '../introOpening';

/**
 * The tester's 39469: the introduction said „<asker> asks you" and showed
 * „his message: „…"" — words he never typed. #1420 and D648: it is the
 * assistant's request, and what it is about is said plainly.
 */
describe('an introduction request is the assistant’s', () => {
  it('names the asker’s assistant and quotes nothing (ka)', () => {
    const text = incomingRequestOpening('ka', 'გიორგი', 'ნინო', 'დიზაინერია', false);
    // #6351 (Giorgi's wording, Misho's yes 20 Oct): the helper's own assistant speaks.
    expect(text).toContain(
      'დამიკავშირდა გიორგის ასისტენტი, გიორგის აინტერესებს, იცნობ თუ არა ნინოს და შეძლებ ' +
        'თუ არა დააკავშირო. მითხარი შენი პოზიცია და მე გადავცემ.',
    );
    expect(text).toContain('რაზეა საქმე: დიზაინერია');
    expect(text).not.toContain('"');
    expect(text).not.toContain('მისი შეტყობინება');
  });

  it('writes Latin names in Georgian script, without „Ally" (#6351)', () => {
    const text = incomingRequestOpening('ka', 'Gela Beridze', 'Nino Beridze Ally', null, false);
    expect(text).toContain('დამიკავშირდა გელა ბერიძის ასისტენტი, გელას აინტერესებს');
    expect(text).toContain('იცნობ თუ არა ნინო ბერიძეს');
    expect(text).not.toMatch(/Ally|[A-Za-z]/);
  });

  it('writes even an unsure name in Georgian script (D859)', () => {
    const text = incomingRequestOpening('ka', 'Giorgi Turashvili', 'Nino Japaridze', null, false);
    expect(text).not.toMatch(/[A-Za-z]/);
    expect(text).toContain('ნინო ჯაპარიძეს');
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
