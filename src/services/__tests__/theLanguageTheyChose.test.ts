import { readFileSync } from 'fs';
import { join } from 'path';

import { asRunLanguage } from '../runLanguage';

/**
 * EVERY CARD SPLIT DOWN THE MIDDLE, AND BOTH HALVES WERE RIGHT.
 *
 * `detail` on an update card is written by the server, in the language
 * inferred from what the person writes. The screen around it is drawn by the
 * app, in the language they picked on their profile. For anybody whose two
 * disagree — profile English, writes Georgian — the chrome came out in one
 * language and our line in the other, on EVERY kind, not just the weekly
 * summary where we happened to both be looking.
 *
 * ⚠️ NEITHER SIDE WAS A BUG, which is the whole reason it could last. Each
 * answer was correct by its own source. Nobody would have filed it; it would
 * only have looked strange, permanently. The fix is not a better rule on
 * either side — it is one fact from one source.
 *
 * The frontend now sends `X-Locale` on every authorised request (build
 * 1953859), and sends it ONLY when a choice exists.
 */
describe('the language they chose wins, and only when they chose', () => {
  it('accepts the four languages we actually speak', () => {
    expect(asRunLanguage('ka')).toBe('ka');
    expect(asRunLanguage('en')).toBe('en');
    expect(asRunLanguage('ru')).toBe('ru');
    expect(asRunLanguage('es')).toBe('es');
  });

  /** `en-GB`, `KA`, ` en ` — a locale header is not always a bare code. */
  it('reads a real locale header rather than an exact string', () => {
    expect(asRunLanguage('en-GB')).toBe('en');
    expect(asRunLanguage('KA')).toBe('ka');
    expect(asRunLanguage(' es ')).toBe('es');
  });

  /**
   * ⚠️ THE ASSERTION THE WHOLE CHANGE RESTS ON.
   *
   * A missing header means „nobody has said", not English. Defaulting it to
   * `en` would put back the exact fault `runLanguage.ts` spent a screen
   * arguing out of the text layer — „NO EVIDENCE IS NOT EVIDENCE OF ENGLISH" —
   * only at the HTTP layer instead, where it would be harder to see.
   */
  it('treats absent or unknown as no answer, never as English', () => {
    expect(asRunLanguage(undefined)).toBeNull();
    expect(asRunLanguage('')).toBeNull();
    expect(asRunLanguage('   ')).toBeNull();
    expect(asRunLanguage('de')).toBeNull();
    expect(asRunLanguage('zz')).toBeNull();
    expect(asRunLanguage(7)).toBeNull();
    expect(asRunLanguage(null)).toBeNull();
  });

  /**
   * And the route spends it the right way round: the chosen language when
   * there is one, the inference otherwise. Asserted on the source because the
   * alternative is standing up Express and a database to observe one branch.
   */
  it('prefers the header and falls back to what we infer', () => {
    const route = readFileSync(
      join(__dirname, '..', '..', 'api', 'routes', 'updates.routes.ts'),
      'utf8',
    );

    expect(route).toContain("asRunLanguage(req.get('X-Locale'))");
    // The fallback is still there — a person who chose nothing loses nothing.
    expect(route).toContain('userLanguage(userId)');
    expect(route).toMatch(/chosen !== null/);
  });
});
