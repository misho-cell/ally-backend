import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

import { foldedLower, foldGeorgianCase } from '../georgianCase';

/**
 * ROW 277 — A CONTACT SAVED IN CAPITAL GEORGIAN LETTERS COULD NOT BE FOUND.
 *
 * ⚠️ JAVASCRIPT FOLDS MTAVRULI AND POSTGRES DOES NOT, and that one sentence is
 * the whole bug — invisible from either side alone.
 *
 * Measured 28 September on the live database:
 *
 *     node:      'ᲗᲐᲛᲐᲠ'.toLowerCase()  →  'თამარ'    folded
 *     postgres:  lower('ᲗᲐᲛᲐᲠ')         →  'ᲗᲐᲛᲐᲠ'    unchanged
 *
 * So the query lowercased in JavaScript came out in ordinary letters while the
 * stored name lowercased in SQL stayed in capitals, and the two could never
 * meet. BOTH directions failed: the tester searched in ordinary letters, in
 * capitals, and with the exact stored string, and got `found:false` three times
 * for a contact that was demonstrably in the phonebook.
 *
 * A phone stores what its owner typed, so this is not a test-seat curiosity —
 * any real contact entered in caps hits it.
 */
/**
 * Does this source lowercase anything WITHOUT folding?
 *
 * ⚠️ `foldedLower` IS STRIPPED FIRST, and the first version of this test did
 * not do that. Its regex was case-insensitive, so it matched the „Lower(" in
 * `foldedLower(` and reported every file I had just fixed as still broken —
 * a test that fails on its own fix is worse than no test, because the obvious
 * reading is that the fix did not work.
 */
function bareLowerIn(code: string): boolean {
  return /LOWER\s*\(/i.test(code.split('foldedLower(').join('FOLDED('));
}

describe('a name in capitals is still the same name', () => {
  const MTAVRULI = 'ᲗᲐᲛᲐᲠ ᲒᲐᲛᲝᲒᲝᲜᲘᲚᲘ';
  const MKHEDRULI = 'თამარ გამოგონილი';

  it('folds Georgian capitals in the SQL it builds, not just in JavaScript', () => {
    const sql = foldedLower('a.alias');

    expect(sql).toContain('TRANSLATE');
    expect(sql).toContain('LOWER');
    // The two ends of the map, so a truncated constant cannot pass.
    expect(sql).toContain('Ა');
    expect(sql).toContain('ა');
  });

  /**
   * The pairs are generated from JavaScript's own `toLowerCase`, so the SQL
   * fold and the JS fold agree by construction. This checks that claim rather
   * than trusting it: every Mtavruli letter with a lowercase form must appear
   * in the SQL map, opposite the right letter.
   */
  it('maps every Mtavruli letter to what JavaScript lowercases it to', () => {
    const sql = foldedLower('x');
    const [, upper, lower] = sql.match(/'([^']+)',\s*'([^']+)'/) ?? [];

    expect(upper).toBeDefined();
    expect([...(upper ?? '')].length).toBe([...(lower ?? '')].length);
    [...(upper ?? '')].forEach((capital, i) => {
      expect(capital.toLowerCase()).toBe([...(lower ?? '')][i]);
    });
  });

  it('covers the whole Mtavruli block, not the letters somebody happened to type', () => {
    const sql = foldedLower('x');
    for (let c = 0x1c90; c <= 0x1cbf; c += 1) {
      const letter = String.fromCodePoint(c);
      // Only the ones that actually have a lowercase form are in the map;
      // the others are unassigned and must not be invented.
      if (letter.toLowerCase() !== letter) expect(sql).toContain(letter);
    }
  });

  it('agrees with the JavaScript half on the name that found nothing', () => {
    expect(foldGeorgianCase(MTAVRULI)).toBe(MKHEDRULI);
  });

  /**
   * ⚠️ ONE BARE `LOWER` LEFT IN A SEARCH PATH IS WORSE THAN THE ORIGINAL BUG,
   * because the search then works for a name and silently fails for a tag, and
   * nobody would look for a casing fault in half a feature.
   *
   * These are the files a first-degree search by name actually runs through —
   * the path row 277 is about. Not one of them may lowercase stored text
   * without folding, and a new one added here fails this test rather than
   * failing on somebody's phone.
   */
  const NAME_SEARCH_PATH = [
    'wordMatch.ts',
    'searchContactByName.ts',
    'nameMatch.ts',
    'requestIntroduction.ts',
    'countryChannels.ts',
    'searchByInsight.ts',
  ];

  it.each(NAME_SEARCH_PATH)('leaves no bare LOWER over stored text in %s', (file) => {
    const code = readFileSync(join(__dirname, '..', file), 'utf8')
      .split('\n')
      .filter((line) => !/^\s*(\*|\/\*|\/\/)/.test(line))
      .join('\n');

    expect(bareLowerIn(code)).toBe(false);
  });

  /**
   * ⚠️ AND THE PART THAT IS NOT FIXED, NAMED RATHER THAN LEFT TO BE NOTICED.
   *
   * Second-degree search and the by-country search still lowercase stored
   * aliases, tags and facts without folding, so a contact saved in capitals is
   * still unfindable THROUGH SOMEBODY ELSE even though they can now be found
   * directly.
   *
   * It is not fixed in the same change on purpose. Those queries carry hand-
   * tuned plans — `wordMatch`'s own comment explains that the `|| ''` wrapper
   * exists to keep the planner off a particular index — and wrapping a column
   * in `TRANSLATE` changes the expression's shape, which is exactly how an
   * index stops being used. That is a measurement I have not made, and making
   * a second-degree search quietly slower to fix a casing bug would be trading
   * a visible fault for an invisible one.
   *
   * This test exists so the remaining half cannot be forgotten: when those
   * files are folded, this list empties and the assertion above covers them.
   */
  it('names the searches that still have the hole, rather than leaving them unlisted', () => {
    const stillUnfolded = ['searchSecondDegree.ts', 'searchContactsByCountry.ts'];
    const dir = join(__dirname, '..');

    const actual = readdirSync(dir)
      .filter((f) => f.endsWith('.ts') && f !== 'georgianCase.ts')
      .filter((f) => !NAME_SEARCH_PATH.includes(f))
      .filter((f) => {
        const code = readFileSync(join(dir, f), 'utf8')
          .split('\n')
          .filter((line) => !/^\s*(\*|\/\*|\/\/)/.test(line))
          .join('\n');
        return bareLowerIn(code);
      });

    expect(actual.sort()).toEqual(stillUnfolded.sort());
  });
});
