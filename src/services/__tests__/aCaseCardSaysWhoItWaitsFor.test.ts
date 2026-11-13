import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * #9046 (Giorgi, 9 Nov): with the groups gone, each case card says its state,
 * „ველოდები N-ის პასუხს" among them. The list carries `waiting_for`: the number
 * of distinct people the owner's own case waits to hear from.
 */
describe('the case list’s waiting_for', () => {
  const threads = readFileSync(join(__dirname, '..', 'threads.service.ts'), 'utf8');
  const at = threads.indexOf('const WAITING_FOR_SQL =');
  const sql = threads.slice(at, threads.indexOf('`;', at));

  it('rides on every list row, the page and the open goals alike', () => {
    expect(at).toBeGreaterThan(0);
    expect(threads).toContain('${WAITING_FOR_SQL} AS waiting_for');
  });

  it('counts each person once, as a number', () => {
    expect(sql).toContain('COUNT(DISTINCT w.who)::int');
  });

  it('counts questions sent and neither answered nor expired', () => {
    expect(sql).toContain("ta.status = 'sent' AND ta.expired_at IS NULL");
  });

  it('counts a request still with the go-between, and an accepted one whose person has not answered', () => {
    expect(sql).toContain("r.status = 'pending'");
    expect(sql).toContain(
      "r.status = 'accepted' AND r.target_asked_at IS NOT NULL\n                     AND r.target_answered_at IS NULL",
    );
  });

  it('is the owner’s own case only', () => {
    expect(sql).toContain('r.requester_user_id::text = t.user_id::text');
  });
});
