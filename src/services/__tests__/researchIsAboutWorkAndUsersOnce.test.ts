jest.mock('../../db/postgres/client', () => ({
  __esModule: true,
  query: jest.fn(),
  backgroundQuery: jest.fn(),
}));
jest.mock('../tools/webSearch', () => ({ __esModule: true, webSearch: jest.fn() }));

import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * 4126 item 4 (D757, Misho's yes §133): the runner researches work. A number
 * somebody marked family or close is never picked, and a Netai user is
 * researched once, never again every 30 days.
 */
const source = readFileSync(join(__dirname, '..', 'researchRunner.service.ts'), 'utf8');
const next = source.slice(source.indexOf('async function nextPeople'));

describe('who the research runner picks', () => {
  it('never picks a number somebody marked family or close', () => {
    expect(source).toContain(
      "const PRIVATE_RELATIONSHIPS: readonly string[] = ['family', 'close'];",
    );
    expect(next).toContain('cr.relationship_type = ANY($3::text[])');
    expect(next).toContain('[limit, refreshDays, PRIVATE_RELATIONSHIPS]');
  });

  it('researches a Netai user only when never researched before', () => {
    expect(next).toMatch(
      /r\.last_run IS NULL\s+OR \(r\.last_run < NOW\(\)[\s\S]*?AND NOT EXISTS \(\s+SELECT 1 FROM "UserPhone"/,
    );
  });
});
