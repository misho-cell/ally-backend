import { readFileSync } from 'fs';
import { join } from 'path';
import { claimsItCannotSend } from '../askedVerb';

/**
 * The master test run's 45679 (conv 44096): the question went to Elene, and
 * the reply said „ამ ჩატიდან შეტყობინებას ვერ ვაგზავნი".
 */
describe('a run whose question went', () => {
  it('recognises a claim that it cannot send', () => {
    expect(
      claimsItCannotSend(
        'ელენესთვის კითხვა მზადაა: „რომელ ტაქსის მძღოლს იძახებ?“\n\nამ ჩატიდან შეტყობინებას ვერ ვაგზავნი.',
      ),
    ).toBe(true);
    expect(claimsItCannotSend("I can't send messages from this chat.")).toBe(true);
    expect(claimsItCannotSend('ელენეს კითხვა გავუგზავნე.')).toBe(false);
  });

  it('says it sent instead, when exactly one person was asked', () => {
    const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
    expect(chat).toContain('if (askedOne.length === 1 && claimsItCannotSend(effectiveFinal)) {');
    expect(chat).toContain('effectiveFinal = sentSentenceForOwner(askedOne[0], language);');
    expect(chat).toContain('runAskSentTo.delete(runId);');
  });
});
