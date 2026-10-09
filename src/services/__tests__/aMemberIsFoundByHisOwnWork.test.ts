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
});
