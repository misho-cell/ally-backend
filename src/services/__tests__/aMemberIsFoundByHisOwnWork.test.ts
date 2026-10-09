import { readFileSync } from 'fs';
import { join } from 'path';

/** 1694 (box 47985; §110.6): a member contact is found by what he told his own assistant about his work. */
describe('the own-profile search branch', () => {
  const sql = readFileSync(join(__dirname, '..', 'tools', 'wordMatch.ts'), 'utf8');

  it('reads only the work keys of a member the owner holds', () => {
    expect(sql).toContain('JOIN user_profile_kv kv ON kv.user_id = up4."userId"::text');
    expect(sql).toContain('WHERE up4.phone IN (SELECT phone FROM mine)');
    expect(sql).toContain("AND kv.key IN ('profession', 'industry')");
  });

  it('never reads interests or searched topics', () => {
    expect(sql).not.toMatch(/kv\.key IN \([^)]*interests/u);
  });
  it('marks only that branch as the member’s own work (§111.2)', () => {
    expect(sql.match(/TRUE AS self_work/gu)).toHaveLength(1);
    expect(sql).toMatch(/TRUE AS own,\s+TRUE AS self_work\s+FROM "UserPhone" up4/u);
    expect(sql.match(/FALSE AS self_work/gu)).toHaveLength(6);
  });

  it('flags a row found only that way, and gives the model nothing of their words', () => {
    const tag = readFileSync(join(__dirname, '..', 'tools', 'searchByTag.ts'), 'utf8');
    expect(tag).toContain('bool_and(self_work) AS self_work_only');
    expect(tag).toContain('BOOL_AND(h.self_work_only) AS self_work_only');
    expect(tag).toContain('...(row.self_work_only === true && { found_by_their_own_work: true }),');
    expect(tag).not.toMatch(/kv\.value/u);
  });
});
