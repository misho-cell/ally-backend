/**
 * Chorus, 2 October: bubbleDensityForPhones timed out at 8 s on every warm-up
 * and took the whole target list down. Density is optional (D71), so it gets
 * the background budget and a failure serves the list on raw reach.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

const SOURCE = readFileSync(join(__dirname, '..', 'targetScoring.service.ts'), 'utf8');

describe('the bubble density read', () => {
  it('runs on the background budget, not the 8-second one', () => {
    const fn = SOURCE.slice(SOURCE.indexOf('async function bubbleDensityForPhones'));
    const body = fn.slice(0, fn.indexOf('\n}\n'));

    expect(body).toContain('REACH_QUERY_TIMEOUT_MS');
    expect(body).not.toContain('SCORE_QUERY_TIMEOUT_MS');
  });

  it('cannot fail the build — a failure serves the list without density', () => {
    expect(SOURCE).toMatch(
      /const densities = await bubbleDensityForPhones\([\s\S]{0,80}\)\.catch\(/,
    );
    expect(SOURCE).toContain('bubble density unavailable, raw reach used');
  });
});
