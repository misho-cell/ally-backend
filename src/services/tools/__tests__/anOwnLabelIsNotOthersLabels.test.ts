import { readFileSync } from 'fs';
import { join } from 'path';
import { othersLabelsMatched } from '../searchByTag';

/**
 * The tester's 988 (Test 73, nine lawyers saved by the owner as „iuristi" /
 * „advokati"): every one came back `found_by_others_labels`, because each
 * phone also carries labels other people saved — and the run told the owner
 * it could confirm none of them. The flag now means „found ONLY through other
 * people's labels".
 */
describe('found_by_others_labels', () => {
  const row = { all_tags: ['iuristi', 'driver'], own_tags: ['iuristi'] };

  it('is not set when one of the owner’s own labels matched', () => {
    expect(othersLabelsMatched({ ...row, own_hit: true })).toBe(false);
  });

  it('is set when only other people’s labels matched', () => {
    expect(othersLabelsMatched({ ...row, own_hit: false })).toBe(true);
  });

  it('keeps the old reading where the query does not say (the fuzzy pass)', () => {
    expect(othersLabelsMatched(row)).toBe(true);
    expect(othersLabelsMatched({ all_tags: ['iuristi'], own_tags: ['iuristi'] })).toBe(false);
  });
});

describe('where own_hit comes from', () => {
  const words = readFileSync(join(__dirname, '..', 'wordMatch.ts'), 'utf8');
  const tag = readFileSync(join(__dirname, '..', 'searchByTag.ts'), 'utf8');
  const name = readFileSync(join(__dirname, '..', 'searchContactByName.ts'), 'utf8');

  it('marks a match on the owner’s tag or alias as own, another’s private fact as not', () => {
    expect(words).toContain('(t."contactId" = $1) AS own');
    expect(words).toContain('(a."contactId" = $1) AS own');
    expect(words).toContain('FALSE AS own');
  });

  it('is carried by both searches that use the match query', () => {
    expect(tag).toContain('bool_or(own) AS own_hit');
    expect(tag).toContain('BOOL_OR(h.own_hit) AS own_hit');
    expect(name).toContain('bool_or(own) AS own_hit');
    expect(name).toContain('BOOL_OR(h.own_hit)');
  });
});
