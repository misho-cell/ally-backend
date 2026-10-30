import { readFileSync } from 'fs';
import { join } from 'path';
import { isFreeOfficialPageRead, OFFICIAL_READS_PAST_BUDGET } from '../officialPageRead';

/**
 * #8350 (tester 79211): the name was right 20/20, but the read of the official
 * page that names the office holder was refused as „budget spent" after two
 * slow searches. A run's first reads of an official page are outside the budget.
 */
describe('reading an official page', () => {
  it('is free for a government page, up to the run’s allowance', () => {
    const read = { url: 'https://napr.gov.ge/ka/department' };
    expect(isFreeOfficialPageRead('fetch_page', read, 0)).toBe(true);
    expect(isFreeOfficialPageRead('fetch_page', read, OFFICIAL_READS_PAST_BUDGET - 1)).toBe(true);
    expect(isFreeOfficialPageRead('fetch_page', read, OFFICIAL_READS_PAST_BUDGET)).toBe(false);
  });

  it('is not free for a news page, a search, or a missing address', () => {
    expect(isFreeOfficialPageRead('fetch_page', { url: 'https://news.example.ge/a' }, 0)).toBe(
      false,
    );
    expect(isFreeOfficialPageRead('web_search', { url: 'https://moh.gov.ge' }, 0)).toBe(false);
    expect(isFreeOfficialPageRead('fetch_page', {}, 0)).toBe(false);
  });

  it('is checked before the search budget, and its count is forgotten with the run', () => {
    const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
    const gate = chat.slice(chat.indexOf('const freeOfficialRead ='));
    expect(gate.indexOf('!freeOfficialRead &&')).toBeLessThan(gate.indexOf('searchBudgetSpent('));
    expect(chat).toContain('runOfficialReads.delete(runId);');
  });
});
