import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * 2311 (tester box 56943, threads 51201/51202): with a go-between who had
 * opened the app, CE still made no introduction. CE passes the number as the
 * name search gives it, digits only; the alias row keeps „+995…", so the exact
 * match found nobody and every server introduction was refused, silently.
 */
const intro = readFileSync(join(__dirname, '..', 'tools', 'requestIntroduction.ts'), 'utf8');
const fallback = readFileSync(join(__dirname, '..', 'introFallback.ts'), 'utf8');

describe('the go-between named by number', () => {
  it('is matched by digits, not by how the number was written', () => {
    expect(intro).toContain(
      "AND regexp_replace(ua.phone, '\\\\D', '', 'g') = regexp_replace($2, '\\\\D', '', 'g')",
    );
    expect(intro).not.toContain('ua."contactId" = $1 AND ua.phone = $2');
  });

  it('a refused server introduction says why in the log, by reason code only', () => {
    expect(fallback).toContain('[server-intro] user ${userId}: refused (');
    expect(fallback).not.toMatch(/console\.log\([^)]*outcome\.error/u);
  });
});
