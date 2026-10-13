import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * 4930 (Giorgi, 13 Oct): every „შეჩერებულია" case belongs in „შენს პასუხს
 * ელოდება". A paused goal's thread read `done` and sat with the solved ones.
 */
const source = readFileSync(join(__dirname, '..', 'threads.service.ts'), 'utf8');

describe('a paused goal', () => {
  it('reads needs_you before any other rule, with no stale status line', () => {
    expect(source).toMatch(
      /STATUS_HONEST_ABOUT_OPEN_GOALS = `CASE\s+WHEN \$\{HAS_PAUSED_GOAL\} THEN 'needs_you'/u,
    );
    expect(source).toMatch(
      /STATUS_LINE_HONEST_ABOUT_OPEN_GOALS = `CASE\s+WHEN \$\{HAS_PAUSED_GOAL\} THEN NULL/u,
    );
  });

  it('is paused only while no goal on the thread is open', () => {
    expect(source).toContain("k.status = 'paused')\n         AND NOT ${HAS_OPEN_GOAL})");
  });

  it('says so in the list row, for the card label', () => {
    expect(source).toContain('${HAS_PAUSED_GOAL} AS goal_paused,');
  });
});
