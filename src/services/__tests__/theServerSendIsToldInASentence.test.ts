import { readFileSync } from 'fs';
import { join } from 'path';
import { sentSentenceForOwner } from '../askState';

/** 2872 (45641, 6 of 6): the owner's whole reply was „<name>: კითხვა მიუვიდა, პასუხს ველოდები". */
describe('theServerSendIsToldInASentence', () => {
  it('tells one person asked in a plain sentence, the name in its case', () => {
    expect(sentSentenceForOwner('ნინო ტესტაძე', 'ka')).toBe(
      'ნინო ტესტაძის ასისტენტს კითხვა გავუგზავნე. როგორც კი პასუხი მოვა, მაშინვე მოგწერ.',
    );
    expect(sentSentenceForOwner('Nino', 'en')).toBe(
      "I sent your question to Nino's assistant. I will tell you as soon as the answer comes.",
    );
  });

  it('is what the server fallback says after it sends', () => {
    const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
    expect(chat).toContain('return sentSentenceForOwner(person.toName, language);');
    expect(chat).toContain('outcome.people.map((person) => personLineForOwner(person, language))');
  });
});

/** #6767 reopened (tester 23:08Z, D859): a Latin label with „Ally" in the server's sentence. */
describe('the sentence that says a question went', () => {
  it('names an own contact in Georgian script, without „Ally"', () => {
    const { sentSentenceForOwner } = jest.requireActual('../askState') as {
      sentSentenceForOwner: (name: string, language: string) => string;
    };
    const line = sentSentenceForOwner('Ana Pirveladze Ally', 'ka');
    expect(line).not.toMatch(/[A-Za-z]/);
    expect(line).toContain('ასისტენტს კითხვა გავუგზავნე');
  });

  it('only drops „Ally" in another language', () => {
    const { sentSentenceForOwner } = jest.requireActual('../askState') as {
      sentSentenceForOwner: (name: string, language: string) => string;
    };
    expect(sentSentenceForOwner('Ana Pirveladze Ally', 'en')).toContain(
      "Ana Pirveladze's assistant",
    );
  });
});
