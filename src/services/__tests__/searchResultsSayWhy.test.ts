import { readFileSync } from 'fs';
import { join } from 'path';
import { mergeFamilyResults, MAX_FAMILY_ROWS } from '../professionSearch';
import { relatedProfessionWords } from '../professionFamilies';

/** #8647 (the tester's 81446): search results carry why, and stay short. */
describe('search results say why and stay short', () => {
  it('no longer reads a doctor as an MD, which also means Managing Director', () => {
    expect(relatedProfessionWords('doctor')).not.toContain('MD');
    expect(relatedProfessionWords('ექიმი')).toContain('doctor');
  });

  it('caps a merged family search, the asked word’s rows first, and counts the rest', () => {
    const many = Array.from({ length: 30 }, (_, i) => ({ phone: `+1202555${1000 + i}` }));
    const more = Array.from({ length: 30 }, (_, i) => ({ phone: `+1202555${2000 + i}` }));
    const merged = mergeFamilyResults({ results: many }, [
      { word: 'w', result: { results: more } },
    ]) as {
      results: unknown[];
      total?: number;
      more_not_shown?: number;
    };
    expect(merged.results).toHaveLength(MAX_FAMILY_ROWS);
    expect(merged.total).toBe(60);
    expect(merged.more_not_shown).toBe(60 - MAX_FAMILY_ROWS);
    expect(merged.results[0]).toEqual(many[0]);
  });

  it('gives the country search each person’s labels, direct and second circle', () => {
    const code = readFileSync(join(__dirname, '..', 'tools', 'searchContactsByCountry.ts'), 'utf8');
    expect(code.match(/labels: r\.labels \?\? null/gu)?.length ?? 0).toBeGreaterThanOrEqual(4);
  });

  it('searches facts by a profession’s other names too', () => {
    const code = readFileSync(join(__dirname, '..', 'tools', 'searchByInsight.ts'), 'utf8');
    expect(code).toContain("...relatedProfessionWords(word).filter((w) => !w.includes(' ')),");
  });
});
