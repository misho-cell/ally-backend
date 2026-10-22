import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * #7261 (tester 72638, conversation 63374): the go-between agreed and added
 * „დამანებე თავი", and the asker read that she „seemed annoyed and wants no
 * more bother". The relay of a go-between's own words now says, in every
 * language, never to describe their mood or pass on „do not bother me".
 */
const events = readFileSync(join(__dirname, '..', 'taskEngine.events.ts'), 'utf8');
const relay = events.slice(events.indexOf('function answerInOwnWords'));
const body = relay.slice(0, relay.indexOf('\n}\n'));

describe('the go-between’s words reach the asker’s run without their mood', () => {
  it.each([
    ['ka', 'მათი განწყობა ან ემოცია არასდროს აღწერო'],
    ['en', 'Never describe their mood or feelings'],
    ['ru', 'Никогда не описывай их настроение'],
    ['es', 'Nunca describas su ánimo'],
  ])('says so in %s', (_language, sentence) => {
    expect(body).toContain(sentence);
  });
});
