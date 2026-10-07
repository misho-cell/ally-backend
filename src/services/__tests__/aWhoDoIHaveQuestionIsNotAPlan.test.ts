import { readFileSync } from 'fs';
import { join } from 'path';
import { asksWhoTheyHave } from '../replyGuards';

/** T2443 (SE-001): a question about who the owner has is answered by the search, with no plan. */
describe('aWhoDoIHaveQuestionIsNotAPlan', () => {
  it('reads „who do I have" questions', () => {
    expect(asksWhoTheyHave('სანტექნიკი მჭირდება თბილისში. ვინ მყავს კონტაქტებში?')).toBe(true);
    expect(asksWhoTheyHave('ვინ ვიცნობ ბანკში?')).toBe(true);
    expect(asksWhoTheyHave('Who do I have in real estate?')).toBe(true);
  });

  it('leaves a request to act alone', () => {
    expect(asksWhoTheyHave('სანტექნიკი მჭირდება თბილისში, იქნებ ნაცნობებმა იციან')).toBe(false);
    expect(asksWhoTheyHave('ვინ მყავს კონტაქტებში? ჰკითხე მათ, იციან თუ არა')).toBe(false);
    expect(asksWhoTheyHave('find me a plumber')).toBe(false);
  });

  it('keeps the phonebook-members note off such a question', () => {
    const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
    expect(chat).toContain("!asksWhoTheyHave(runOwnerLine.get(runId) ?? '') &&");
  });
});
