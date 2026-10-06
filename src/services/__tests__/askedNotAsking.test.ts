import { readFileSync } from 'fs';
import { join } from 'path';
import { askedNotAsking } from '../askedVerb';

/** #2115 (tester 43066, 41583/41584): „ჰკითხე" handed back to the owner after the question went. */
describe('a sent question is told as asked', () => {
  it('turns the echoed command into „I asked"', () => {
    expect(
      askedNotAsking(
        'მარი ტესტიძეს ჰკითხე, ხვალ თავისუფალია თუ არა. პასუხს როგორც კი მომცემს, გაგაცნობ.',
      ),
    ).toBe('მარი ტესტიძეს ვკითხე, ხვალ თავისუფალია თუ არა. პასუხს როგორც კი მომცემს, გაგაცნობ.');
  });

  it('leaves a sentence that tells the owner to ask himself', () => {
    const text = 'ნიკას ვკითხე. თუ გინდა, შენ თვითონ ჰკითხე მარის.';
    expect(askedNotAsking(text)).toBe(text);
  });

  it('touches only the whole word, and nothing else in the text', () => {
    const text = 'ჰკითხეს უკვე. მარიამ ჰკითხა.';
    expect(askedNotAsking(text)).toBe(text);
  });

  it('runs only on a Georgian reply of a run that sent a question', () => {
    const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
    expect(chat).toContain(
      "if (language === 'ka' && runAskSent.has(runId)) effectiveFinal = askedNotAsking(effectiveFinal);",
    );
    expect(chat).toContain('if (runId) runAskSent.add(runId);');
    expect(chat).toContain('runAskSent.delete(runId);');
  });
});
