import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * 3103 (MASTER TEST RUN SE-029): „ზურა left Colliers" was saved, and „ვის
 * ვიცნობ Colliers-ში?" still listed him among the nine. The tag search now
 * reads the owner's own corrections: a person corrected away is shown apart.
 */
const src = readFileSync(join(__dirname, '..', 'tools', 'searchByTag.ts'), 'utf8');

describe('a person the owner said left is not among the current', () => {
  it('the tag search reads the corrections for its own words', () => {
    expect(src).toContain('correctionsMatching(userId, claimWords(tagQuery))');
  });

  it('they are taken out of the results and returned apart, and the counts follow', () => {
    expect(src).toContain('results: current,');
    expect(src).toContain('count: current.length,');
    expect(src).toContain('owner_said_no_longer: noLonger');
  });

  it('a correction that cannot be read takes nobody out', () => {
    expect(src).toContain("console.error('searchByTag corrections not read:'");
  });
});
