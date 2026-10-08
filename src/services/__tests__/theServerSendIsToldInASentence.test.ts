import { readFileSync } from 'fs';
import { join } from 'path';
import { sentSentenceForOwner } from '../askState';

/** 2872 (45641, 6 of 6): the owner's whole reply was „<name>: კითხვა მიუვიდა, პასუხს ველოდები". */
describe('theServerSendIsToldInASentence', () => {
  it('tells one person asked in a plain sentence, the name in its case', () => {
    expect(sentSentenceForOwner('ნინო ტესტაძე', 'ka')).toBe(
      'ნინო ტესტაძეს კითხვა გავუგზავნე. როგორც კი გიპასუხებს, მაშინვე მოგწერ.',
    );
    expect(sentSentenceForOwner('Nino', 'en')).toBe(
      'I sent your question to Nino. I will tell you as soon as they answer.',
    );
  });

  it('is what the server fallback says after it sends', () => {
    const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
    expect(chat).toContain('return sentSentenceForOwner(outcome.toName, language);');
  });
});
