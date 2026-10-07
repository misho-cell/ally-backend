import { readFileSync } from 'fs';
import { join } from 'path';
import { carriesLanguage } from '../runLanguage';

/**
 * #2344 (Lika and Ninia, point 29): Stop, tapped while Netai worked in a
 * Georgian conversation, was answered „There is no goal to stop in this
 * conversation." The button's short word says no language.
 */
describe('the answer to a stop', () => {
  it('reads the conversation’s language when the stop line carries none', () => {
    expect(carriesLanguage('Stop')).toBe(false);
    const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
    expect(chat).toContain(
      ': await threadLanguage(threadId).catch(() => detectRunLanguage(userMessage));',
    );
  });

  it('still follows a stop typed in words', () => {
    expect(carriesLanguage('გააჩერე')).toBe(true);
  });
});
