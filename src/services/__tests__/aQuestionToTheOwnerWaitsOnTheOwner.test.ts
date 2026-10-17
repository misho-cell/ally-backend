import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * 5381 (Giorgi, 16 Oct, G-051): the owner's assistant put a helper's question
 * to the owner in its own words and the case stayed under „ვმუშაობ".
 */
describe('a case whose last word is a question to its owner', () => {
  const source = readFileSync(join(__dirname, '..', 'threads.service.ts'), 'utf8');
  const rule = source.slice(source.indexOf('const ENDS_ON_A_QUESTION_TO_ITS_OWNER'));
  const status = source.slice(source.indexOf('const STATUS_HONEST_ABOUT_OPEN_GOALS'));
  const line = source.slice(source.indexOf('const STATUS_LINE_HONEST_ABOUT_OPEN_GOALS'));

  it('reads the last visible message: the assistant’s, ending in a question mark', () => {
    expect(rule).toContain("c.kind = 'message' AND length(trim(c.content)) > 0");
    expect(rule).toContain('ORDER BY c.created_at DESC LIMIT 1');
    expect(rule).toContain("WHERE last.role = 'assistant'");
    expect(rule).toContain("~ '[?？]$'");
  });

  it('applies only to a case that reads waiting, so the owner’s reply moves it back', () => {
    expect(rule.slice(0, 120)).toContain("t.status = 'waiting'");
  });

  it('applies only to a case with an open goal, not a plain chat kept open (#5282)', () => {
    expect(rule.slice(0, 120)).toContain("t.status = 'waiting' AND ${HAS_OPEN_GOAL} AND EXISTS");
  });

  it('shows the case under „შენს პასუხს ველოდები", without the waiting line', () => {
    expect(status).toContain("WHEN ${ENDS_ON_A_QUESTION_TO_ITS_OWNER} THEN 'needs_you'");
    expect(line).toContain('WHEN ${ENDS_ON_A_QUESTION_TO_ITS_OWNER} THEN NULL');
  });
});
