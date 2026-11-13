import { readFileSync } from 'fs';
import { join } from 'path';

import { EVIDENCE_COUNTED, evidenceScore } from '../searchableData';

/**
 * Misho, 13 Nov (one shared score): a person matched by several different
 * things said about them — a label, a fact, their profile, a company tie —
 * ranks above one matched by a single mention, at every level, after how many
 * of the searched words they match.
 */
describe('the shared score', () => {
  const read = (...p: string[]): string => readFileSync(join(__dirname, '..', ...p), 'utf8');

  it('counts different mentions, three at most, so closeness still decides past that', () => {
    expect(EVIDENCE_COUNTED).toBe(3);
    expect(evidenceScore('m.label')).toBe('LEAST(COUNT(DISTINCT m.label), 3)');
  });

  it('ranks the own circle after the words and the owner’s own labels, before the source kind', () => {
    const tag = read('searchByTag.ts');
    expect(tag).toContain("${evidenceScore('label')} AS evidence");
    expect(tag).toContain(
      'ORDER BY MAX(h.word_hits) DESC, BOOL_OR(h.own_hit) DESC, MAX(h.evidence) DESC,',
    );
  });

  it('ranks the second circle after the words and the owner’s need, before the friends’ count', () => {
    const second = read('searchSecondDegree.ts');
    expect(second).toContain("${evidenceScore('m.label')}");
    expect(second).toMatch(/need_hit DESC,\s+evidence DESC,\s+\(COUNT/u);
    expect(second).toContain('r.need_hit DESC, r.evidence DESC, r.bridge_rank DESC');
  });

  it('orders the far circles’ read by it before the read is cut, never an arbitrary few', () => {
    const far = read('..', 'farCircles.service.ts');
    expect(far).toContain(
      "SELECT phone, ${evidenceScore('words')} AS score FROM matched GROUP BY phone",
    );
    expect(far).toContain('ORDER BY e.score DESC, m.phone\n      LIMIT $3');
  });
});
