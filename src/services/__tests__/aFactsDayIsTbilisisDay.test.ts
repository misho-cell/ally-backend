import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * The tester's 80995 (3 Nov, 00:35 Tbilisi): a fact saved minutes before was
 * said to be „updated yesterday". Its day reached the run as the UTC day
 * (2 Nov) while the run's own date line said 3 Nov in Tbilisi. Every day the
 * run reads beside that line is written in Tbilisi time.
 */
describe('the day a fact carries', () => {
  const read = (file: string): string => readFileSync(join(__dirname, '..', file), 'utf8');

  it.each([
    [
      'tools/factEnrichment.ts',
      "TO_CHAR(updated_at AT TIME ZONE 'Asia/Tbilisi', 'YYYY-MM-DD') AS as_of",
    ],
    [
      'contactFacts.service.ts',
      "TO_CHAR(created_at AT TIME ZONE 'Asia/Tbilisi', 'YYYY-MM-DD') AS first_saved",
    ],
    [
      'contactFacts.service.ts',
      "TO_CHAR(updated_at AT TIME ZONE 'Asia/Tbilisi', 'YYYY-MM-DD') AS last_confirmed",
    ],
    [
      'userPrivateContext.service.ts',
      "TO_CHAR(updated_at AT TIME ZONE 'Asia/Tbilisi', 'YYYY-MM-DD') AS updated_at",
    ],
    [
      'contactPage.service.ts',
      "TO_CHAR(created_at AT TIME ZONE 'Asia/Tbilisi', 'YYYY-MM-DD') AS saved_at",
    ],
  ])('is the Tbilisi day in %s', (file, sql) => {
    expect(read(file)).toContain(sql);
  });
});
