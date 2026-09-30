import { readFileSync } from 'fs';
import { join } from 'path';
import { toMtavruli } from '../tools/georgianCase';

/**
 * Row 278, the second circle — the seat's 864: a bridge's contact saved as
 * „ᲜᲘᲙᲐ ᲐᲓᲕᲝᲙᲐᲢᲘ" (Mtavruli) was the one lawyer of four not found. Postgres's
 * LOWER() leaves Mtavruli as it is, so a Mkhedruli pattern never met it.
 */
const src = readFileSync(join(__dirname, '..', 'tools', 'searchSecondDegree.ts'), 'utf8');

describe('a name saved in Georgian capitals is found through another person', () => {
  it('turns a query word into its capital form', () => {
    expect(toMtavruli('ადვოკატი')).toBe('ᲐᲓᲕᲝᲙᲐᲢᲘ');
    expect(toMtavruli('lawyer')).toBe('lawyer');
    expect(toMtavruli('ნიკა 2')).toBe('ᲜᲘᲙᲐ 2');
  });

  it('gives the index-backed prefilter both forms of each Georgian word', () => {
    expect(src).toContain('const caps = toMtavruli(w);');
    expect(src).toContain('return caps === w ? [w] : [w, caps];');
  });

  it('matches and labels on the folded text, after the prefilter', () => {
    expect(src).toContain("AND ${foldedLower('ut.tag')} ~ $${filterIdx}");
    expect(src).toContain("AND ${foldedLower('ua_m.alias')} ~ $${filterIdx}");
    expect(src).toContain("${foldedLower('ua_m.alias')} AS label");
  });

  it('keeps the prefilter on the indexed LOWER(col), so the trigram index still applies', () => {
    expect(src).toContain("likeAny('LOWER(ut.tag)')");
    expect(src).toContain("likeAny('LOWER(ua_m.alias)')");
  });

  it('places later parameters by the real number of prefilter terms', () => {
    expect(src).toContain('const blockParamIdx = likeIdx + prefilterTerms.length;');
  });
});
