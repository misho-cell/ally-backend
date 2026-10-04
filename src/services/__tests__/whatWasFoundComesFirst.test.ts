jest.mock('../../db/postgres/client', () => ({ __esModule: true, query: jest.fn() }));

import { readFileSync } from 'fs';
import { join } from 'path';
import { FINDS_FIRST_NUDGE, isOnlyAQuestion } from '../replyGuards';
import { hasWebResults } from '../chat.service';

/**
 * The tester's 1149 (38149, 38157): a web search and pages read, then a reply
 * that was only a question — nothing found was shown.
 */
describe('a reply that is only a question', () => {
  it('is recognised', () => {
    expect(
      isOnlyAQuestion(
        'სჯობს ჯერ მითხრა, რა მიზნით გჭირდება: მხედველობის შემოწმება, ლაზერული კორექცია, კატარაქტა თუ ბავშვისთვის?',
      ),
    ).toBe(true);
    expect(
      isOnlyAQuestion(
        'ნაცნობებში ინგლისურის კურსების მცოდნე ვერ გამოჩნდა.\n\nრომელ ქალაქში გინდა საღამოს კურსები?',
      ),
    ).toBe(true);
  });

  it('is not one with a link, one that ends without a question, or an empty one', () => {
    expect(isOnlyAQuestion('ნახე: https://example.ge — ეს გამოდგება?')).toBe(false);
    expect(isOnlyAQuestion('თეკლა მ. საბურთალოზე მოდის.')).toBe(false);
    expect(isOnlyAQuestion('')).toBe(false);
  });

  it('is not a long answer that closes on a question', () => {
    expect(isOnlyAQuestion(`${'ა '.repeat(200)}გინდა?`)).toBe(false);
  });
});

describe('a web search with results', () => {
  it('counts only when rows came back', () => {
    expect(hasWebResults({ results: [{ title: 'კლინიკა' }] })).toBe(true);
    expect(hasWebResults({ results: [] })).toBe(false);
    expect(hasWebResults({ error: 'timeout' })).toBe(false);
    expect(hasWebResults(null)).toBe(false);
  });
});

describe('the note', () => {
  const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');

  it('asks for the finds first, with links, then the question, with no new search', () => {
    expect(FINDS_FIRST_NUDGE).toContain('ჯერ აჩვენე, რაც იპოვე');
    expect(FINDS_FIRST_NUDGE).toContain('ბმული');
    expect(FINDS_FIRST_NUDGE).toContain('თავიდან ნუ მოძებნი');
  });

  it('fires when the run’s own web search found something and the reply is only a question', () => {
    expect(chat).toContain(
      'if (runId !== undefined && hasWebResults(found)) runWebFound.add(runId);',
    );
    expect(chat).toContain('runWebFound.has(runId) &&\n    isOnlyAQuestion(finalText);');
    expect(chat).toContain('? FINDS_FIRST_NUDGE');
    expect(chat).toContain('findsHeldBack ||');
    expect(chat).toContain('runWebFound.delete(runId);');
  });

  it('is never shown as the owner’s own words', () => {
    const set = chat.slice(chat.indexOf('export const MODEL_ONLY_NUDGES'));
    expect(set.slice(0, 400)).toContain('FINDS_FIRST_NUDGE,');
  });
});
