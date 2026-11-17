import { readFileSync } from 'fs';
import { join } from 'path';
import { NUMBER_NOT_FOUND_LINE } from '../instructionUnsent';

/**
 * Alert 661 (a real member, 17 Nov 10:14Z): the owner gave a number to write
 * to, the number was nobody's, and the last line said „it did not go out — a
 * fault on our side". Nothing could go: the owner is told the number was not
 * found, with what they can give instead, and no apology.
 */
describe('a number that belongs to nobody', () => {
  const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
  const alerts = readFileSync(join(__dirname, '..', 'runAlerts.service.ts'), 'utf8');
  const apology = new RegExp(
    (/const APOLOGY_PATTERN =[\s\S]*?;\n/u.exec(alerts)?.[0] ?? '')
      .split('\n')
      .filter((line) => line.trim().startsWith("'"))
      .map((line) => line.trim().replace(/^'|'\s*\+?;?$/gu, ''))
      .join(''),
    'iu',
  );

  it('is remembered when the run’s phone lookup finds nobody, and forgotten with the run', () => {
    expect(chat).toContain(
      'if (runId !== undefined && (byPhone as { found?: unknown }).found === false) {',
    );
    expect(chat).toContain('runNumberNotFound.add(runId);');
    expect(chat).toContain('runNumberNotFound.delete(runId);');
  });

  it('is said plainly as the last line, in place of „our fault"', () => {
    expect(chat).toContain('return { text: NUMBER_NOT_FOUND_LINE[language], nothingWent: true };');
    expect(chat.indexOf('runNumberNotFound.has(runId)')).toBeLessThan(
      chat.indexOf('still nothing sent — said so'),
    );
  });

  it('is never read as an apology for a fault of ours', () => {
    expect(apology.test('კითხვა ვერ გაიგზავნა')).toBe(true);
    for (const line of Object.values(NUMBER_NOT_FOUND_LINE)) expect(apology.test(line)).toBe(false);
  });
});
