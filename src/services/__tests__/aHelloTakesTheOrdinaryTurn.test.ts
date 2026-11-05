import { readFileSync } from 'fs';
import { join } from 'path';
import { BLANK_RETRY_NOTE } from '../greetingTurn';

/**
 * Task 695 (31886): the re-ask after a blank says the first try was empty.
 * (Kept from aGreetingGetsOneShortTurn.test.ts when #8779 group 4 removed the
 * greeting word list and the server's own hello.)
 */
describe('a blank first answer', () => {
  it('is asked again with a note, not the identical request', () => {
    expect(BLANK_RETRY_NOTE).toMatch(/returned nothing/);
    const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
    expect(chat).toContain('systemPrompt + BLANK_RETRY_NOTE');
  });
});

/** #8779 group 4: a hello and small talk take the ordinary turn — no word list picks them out. */
describe('a hello or small talk', () => {
  it('is no longer answered by the server or sent down a short path', () => {
    const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
    for (const gone of ['answerGreeting', 'isBareGreeting', 'isSmallTalk', 'smallTalkOnly']) {
      expect(chat).not.toContain(gone);
    }
  });
});
