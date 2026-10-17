import { readFileSync } from 'fs';
import { join } from 'path';
import { FOUND_BY_OWN_WORK_NOTE } from '../tools/searchByTag';
import { buildExactMatchSql } from '../tools/wordMatch';

/** 1694 (box 47985; §110.6, §111.2) and BP (box 52938; Misho's yes, 12 Oct). */
describe('a member found by his own work', () => {
  const tag = readFileSync(join(__dirname, '..', 'tools', 'searchByTag.ts'), 'utf8');

  it('reads only the work keys of a member the owner holds', () => {
    const sql = buildExactMatchSql('501', [['notary']], [], true).matchedCte;
    expect(sql).toContain('JOIN user_profile_kv kv ON kv.user_id = up4."userId"::text');
    expect(sql).toContain('WHERE up4.phone IN (SELECT phone FROM mine)');
    expect(sql).toContain("AND kv.key IN ('profession', 'industry')");
    expect(sql).not.toMatch(/kv\.key IN \([^)]*interests/u);
  });

  // 5446 (D792): a goal the member helped solve is the second silent branch.
  it('marks only that branch and the solved-case one as found without a reason', () => {
    const sql = buildExactMatchSql('501', [['notary']], [], true).matchedCte;
    expect(sql.match(/TRUE AS self_work/gu)).toHaveLength(2);
  });

  it('is read only by the search that can carry the note — never by default', () => {
    const sql = buildExactMatchSql('501', [['notary']], []).matchedCte;
    expect(sql).not.toContain('user_profile_kv');
    expect(sql).not.toContain('helper_solved_cases');
    expect(sql).not.toContain('TRUE AS self_work');
    expect(tag.match(/buildExactMatchSql\([^)]*?\btrue\b/gu)).toHaveLength(1);
  });

  it('gives such a row the approved sentence and no role of theirs to repeat', () => {
    expect(FOUND_BY_OWN_WORK_NOTE).toBe(
      'This person was found only by what they wrote about themselves. Offer them as someone ' +
        'who may be able to help; never say what they do, what they wrote, or why they came up.',
    );
    expect(tag).toContain('found_by_their_own_work: FOUND_BY_OWN_WORK_NOTE');
    expect(tag).toContain('employer: foundByOwnWorkOnly(row) ? null');
    expect(tag).toContain('jobPosition: foundByOwnWorkOnly(row) ? null');
    expect(tag).not.toMatch(/kv\.value/u);
  });
});
