import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * 10 Nov: from 30 Oct every run-watch pass failed with „function
 * make_interval(mins => text) does not exist" — the unanswered query used one
 * parameter both in a text concatenation and as minutes, Postgres read it as
 * text, and Promise.all took the other three checks down with it. No alert
 * was raised for eleven days. The minutes are cast where they are used.
 */
const SOURCE = readFileSync(join(__dirname, '..', 'runAlerts.service.ts'), 'utf8');

describe('the run watch', () => {
  it('casts every minutes parameter of the unanswered check to an integer', () => {
    const start = SOURCE.indexOf('async function unanswered');
    const body = SOURCE.slice(start, SOURCE.indexOf('\n}\n', start));
    expect(body).toContain('make_interval(mins => $2::int)');
    expect(body).toContain('|| $2::int ||');
    expect(body).not.toMatch(/mins => \$2\)/);
  });
});
