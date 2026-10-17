import { buildExactMatchSql } from '../wordMatch';
import { MATCHED_RESEARCH_STATUSES } from '../../researchFactsView';

/**
 * 4225 (§119.4): the base load's research facts were saved private and
 * unmatchable, so no search could find anyone by them. A confirmed or possible
 * one now finds its person, and the result carries the facts with the approved
 * note (§129). Run against Postgres 16 with every migration on 17 Oct: a
 * possible „ნოტარიუსი" found Nana with its source and date; a rough
 * „ადვოკატი" found nobody; a retracted fact stayed hidden.
 */
describe('a researched fact', () => {
  const sql = buildExactMatchSql('7', [['notariusi']], [], true).matchedCte;

  it('finds its person in the main search when confirmed or possible', () => {
    expect(MATCHED_RESEARCH_STATUSES).toEqual(['confirmed', 'possible']);
    expect(sql).toContain("cf.source = 'public_research'");
    expect(sql).toContain("cf.research_status IN ('confirmed', 'possible')");
  });

  it('never when retracted or removed by the person', () => {
    expect(sql).toContain('cf.retracted_at IS NULL');
    expect(sql).toContain('cf.removed_by_subject_at IS NULL');
  });

  it('is not read by the searches that cannot carry its note', () => {
    expect(buildExactMatchSql('7', [['notariusi']], []).matchedCte).not.toContain(
      'public_research',
    );
  });
});
