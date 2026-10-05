import { readFileSync } from 'fs';
import { join } from 'path';
import { SEARCH_FIRST_NUDGE, asksAboutOwnPeople } from '../replyGuards';

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
    expect(chat).toContain('toolNamesUsed.length === 0 &&');
    expect(chat).toContain('((lateSearch !== null && !/[?？]\\s*$/u.test(finalText.trim())) ||');
    // The tester's 1152 (38606): a quick answer with no opening search, asked about own people.
    expect(chat).toContain('(askedAboutOwnPeople && (lateSearch !== null || ownersQuickRun)));');
    expect(chat).toContain('? SEARCH_FIRST_NUDGE');
  });

  it('is never shown as the owner’s own words', () => {
    const set = chat.slice(chat.indexOf('export const MODEL_ONLY_NUDGES'));
    expect(set.slice(0, 300)).toContain('SEARCH_FIRST_NUDGE,');
  });
});

/** The tester's 1145 (37898): „maybe my friends know" answered with only „which city?". */
describe('a question back to the owner’s ask about their own people', () => {
  it('does not excuse the search', () => {
    expect(asksAboutOwnPeople('ინგლისურის კურსები მინდა. იქნებ ნაცნობებმა იციან.')).toBe(true);
    expect(asksAboutOwnPeople('ელექტრიკოსი მჭირდება. ვინ მყავს კონტაქტებში?')).toBe(true);
    expect(asksAboutOwnPeople('Maybe my friends know someone')).toBe(true);
    expect(asksAboutOwnPeople('კარგი თვალის კლინიკა მირჩიე თბილისში.')).toBe(false);
  });
});
