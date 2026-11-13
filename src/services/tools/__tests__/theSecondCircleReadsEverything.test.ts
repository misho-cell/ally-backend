import { readFileSync } from 'fs';
import { join } from 'path';

import { PROFILE_KEYS_MATCHED } from '../searchableData';

/**
 * Misho, 13 Nov (a real member asked for a freelance B2B salesperson): Likuna,
 * one ring out, was described by Tornike as „freelance; B2B sales" under
 * expertise and founder's words, and the second circle matched facts of four
 * kinds only, so she never came up. It now reads what the owner's own circle
 * reads.
 */
describe('the second circle’s search', () => {
  const src = readFileSync(join(__dirname, '..', 'searchSecondDegree.ts'), 'utf8');
  const factHits = src.slice(src.indexOf('fact_hits AS ('), src.indexOf('member_hits AS ('));
  const memberHits = src.slice(src.indexOf('member_hits AS ('), src.indexOf('case_hits AS ('));

  it('matches every kind of fact but the sensitive ones, needs included (the founder, 1 Sep)', () => {
    expect(factHits).toContain('cf.field_type <> ALL($${excludedFieldsIdx}::text[])');
    expect(factHits).not.toContain('TITLE_FACT_FIELDS');
    expect(src).toContain('const FACT_TYPES_NEVER_MATCHED = SIGNAL_EXCLUDED_FIELD_TYPES;');
  });

  it('matches researched facts that are confirmed or possible, never rough ones, never removed ones', () => {
    expect(factHits).toContain("cf.source = '${RESEARCH_SOURCE}'");
    expect(factHits).toContain('cf.research_status = ANY($${researchStatusesIdx}::text[])');
    expect(factHits).toContain('cf.research_status <> ALL($${researchStatusesIdx}::text[])');
    expect(factHits).toContain('cf.removed_by_subject_at IS NULL');
  });

  it('keeps the old privacy line: public or matchable facts only, besides research', () => {
    expect(factHits).toContain('cf.is_public OR cf.is_matchable');
  });

  it('matches a member’s own profile and offers, held by a bridge', () => {
    expect(memberHits).toContain('um."jobPosition"');
    expect(memberHits).toContain('kv.key = ANY($${profileKeysIdx}::text[])');
    expect(memberHits).toContain('FROM offers o');
    expect(memberHits).toContain('WHERE ua_b."contactId" = ANY(b.ids)');
    expect(src).toContain('SELECT phone, "contactId", label, FALSE AS from_case FROM member_hits');
  });

  it('matches a member’s own profile on profession and industry only (§110.6)', () => {
    expect(PROFILE_KEYS_MATCHED).toEqual(['profession', 'industry', 'city', 'interests']);
    expect(src).toContain("from './searchableData'");
  });
});
