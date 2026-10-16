import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Logs, 15–16 Oct: who to research next took 15–16 s every fifteen minutes on
 * the background pool, sorting all 592,768 score-history rows to keep the
 * latest of 3,363 phones.
 */
describe('who to research next', () => {
  const source = readFileSync(join(__dirname, '..', 'researchRunner.service.ts'), 'utf8');
  const next = source.slice(source.indexOf('async function nextPeople'));

  it('walks the phone index one phone at a time instead of sorting the whole history', () => {
    expect(source).not.toContain('DISTINCT ON (h.phone)');
    expect(source).toContain('WHERE h.phone > p.phone ORDER BY h.phone LIMIT 1');
    expect(source).toContain('WHERE h.phone = p.phone ORDER BY h.built_at DESC LIMIT 1');
    expect(next).toContain('`WITH RECURSIVE ${LATEST_LISTING_SQL}');
  });
});
