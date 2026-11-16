import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Live, 14 Nov 05:00: the daily nudge's push link was never read — `$1` was cast
 * to int in one branch and compared to text in the other, and Postgres refused
 * it („operator does not exist: text = integer"), so the push opened the default
 * page instead of the chat that holds the nudge (#8252).
 */
describe('the nudge push link', () => {
  const src = readFileSync(join(__dirname, '..', 'aiNotification.service.ts'), 'utf8');

  it('compares the owner as text on both sides where a thread is read (16 Nov: the request’s chat)', () => {
    expect(src).toContain('AND t.user_id::text = r.mediator_user_id::text');
    expect(src).toContain("WHERE r.mediator_user_id::text = $1::text AND r.status = 'pending'");
  });

  it('keeps the asks branch an integer comparison', () => {
    expect(src).toContain('WHERE ta.from_user_id = $1::int');
  });
});
