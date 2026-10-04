import { readFileSync } from 'fs';
import { join } from 'path';
import { SEARCH_FIRST_NUDGE } from '../replyGuards';

/**
 * The tester's 1137 (37036): a goal opened from „იურისტი მჭირდება… ვინ მყავს?",
 * no tool called, and „in this chat I cannot see your network".
 */
const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');

describe('a run that opened a goal and searched nothing', () => {
  it('is asked once to search, never to claim it cannot see the network', () => {
    expect(SEARCH_FIRST_NUDGE).toContain('search_by_tag');
    expect(SEARCH_FIRST_NUDGE).toContain('არ თქვა, რომ ქსელს ვერ ხედავ');
  });

  it('fires only on a goal opened from a stated need, with no tool, and no question back', () => {
    expect(chat).toContain('lateSearch !== null &&');
    expect(chat).toContain('toolNamesUsed.length === 0 &&');
    expect(chat).toContain('!/[?？]\\s*$/u.test(finalText.trim());');
    expect(chat).toContain('? SEARCH_FIRST_NUDGE');
  });

  it('is never shown as the owner’s own words', () => {
    const set = chat.slice(chat.indexOf('export const MODEL_ONLY_NUDGES'));
    expect(set.slice(0, 300)).toContain('SEARCH_FIRST_NUDGE,');
  });
});
