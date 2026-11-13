import { buildExactMatchSql } from '../wordMatch';
import { SENSITIVE_FACT_TYPES, sqlConstantList, WORK_FACT_TYPES } from '../searchableData';

/**
 * Misho, 13 Nov: every level reads what the owner's own circle reads, through
 * one list. The main tag search reads every kind of fact but the sensitive ones,
 * the member's own profile and offers; a name search reads only what someone
 * does, because notes and founder's words mention other people's names.
 */
describe('the own-circle search', () => {
  const groups = [['freelance']];

  it('reads every kind of fact but the sensitive ones in the main tag search', () => {
    const { matchedCte: sql } = buildExactMatchSql('7', groups, [], true);
    expect(sql).toContain(`cf.field_type NOT IN (${sqlConstantList(SENSITIVE_FACT_TYPES)})`);
    expect(sql).toContain('cf.removed_by_subject_at IS NULL');
  });

  it('reads only what someone does in a name search, role and affiliation included', () => {
    const { matchedCte: sql } = buildExactMatchSql('7', groups, [], false);
    expect(sql).toContain(`cf.field_type IN (${sqlConstantList(WORK_FACT_TYPES)})`);
    expect(WORK_FACT_TYPES).toEqual(expect.arrayContaining(['role', 'affiliation']));
  });

  it('never lets a private, matchable fact of a sensitive kind point at anyone', () => {
    for (const withOwnWork of [true, false]) {
      const { matchedCte: sql } = buildExactMatchSql('7', groups, [], withOwnWork);
      const branch = sql.slice(sql.indexOf('cf.is_matchable = true'));
      expect(branch).toContain(`cf.field_type NOT IN (${sqlConstantList(SENSITIVE_FACT_TYPES)})`);
    }
  });

  it('reads the member’s own profile keys and offers in the main tag search', () => {
    const { matchedCte: sql } = buildExactMatchSql('7', groups, [], true);
    expect(sql).toContain("kv.key IN ('profession', 'industry', 'city', 'interests')");
    expect(sql).toContain('JOIN offers o ON o.user_id = upo."userId"');
  });
});

describe('a constant list in SQL', () => {
  it('lets only lowercase words through, so it can never carry a quote', () => {
    expect(sqlConstantList(['a_b', 'c'])).toBe("'a_b', 'c'");
    expect(() => sqlConstantList(["x' OR 1=1"])).toThrow();
  });
});
