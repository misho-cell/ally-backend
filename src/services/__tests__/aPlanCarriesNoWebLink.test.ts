import { withClosingQuestion } from '../chat.service';
import { withoutWebLinks } from '../planReplyLinks';

describe('a plan reply carries no web address (box 66992)', () => {
  it('drops the bracketed address in the middle of a word, keeping the word', () => {
    const given =
      'ბესოს ასისტენტს დაველაპარაკები და შევეცდები, გაარკვიოს, იცნობს თუ არა ვინმეს TBC-ში, ' +
      'ვინც შენი ბიზნეს სესხი (http://globalcredit.com.ge/product/Business-Loan)ს განაცხადს დააჩქარებს.';

    expect(withoutWebLinks(given)).toBe(
      'ბესოს ასისტენტს დაველაპარაკები და შევეცდები, გაარკვიოს, იცნობს თუ არა ვინმეს TBC-ში, ' +
        'ვინც შენი ბიზნეს სესხის განაცხადს დააჩქარებს.',
    );
  });

  it('keeps the words of a Markdown link', () => {
    expect(
      withoutWebLinks('I will ask about the [business loan](https://bank.example/loan).'),
    ).toBe('I will ask about the business loan.');
  });

  it('drops a bare address and the space before it', () => {
    expect(withoutWebLinks('I will ask Lika’s assistant about it https://x.example/a.')).toBe(
      'I will ask Lika’s assistant about it.',
    );
  });

  it('leaves a reply without an address exactly as it was', () => {
    const given = 'ლიკას ასისტენტს დაველაპარაკები  და შევეცდები.\n\nდავიწყო?';

    expect(withoutWebLinks(given)).toBe(given);
  });

  it('keeps the line breaks', () => {
    expect(withoutWebLinks('A (https://a.example) b.\n\nდავიწყო?')).toBe('A b.\n\nდავიწყო?');
  });

  it('is applied to every plan reply that ends on the closing question', () => {
    expect(
      withClosingQuestion('Lika’s assistant, about the [loan](https://a.example).', 'en'),
    ).toBe('Lika’s assistant, about the loan.\n\nShall I start?');
  });
});
