import { readFileSync } from 'fs';
import { join } from 'path';

const scoring = readFileSync(join(__dirname, '..', 'targetScoring.service.ts'), 'utf8');
const fn = scoring.slice(
  scoring.indexOf('async function socialProofHolderIds'),
  scoring.indexOf('const SUBSCRIBED_STATUSES'),
);
const sql = fn.slice(fn.indexOf('`SELECT'), fn.indexOf('`,'));

/**
 * Ops' daily check, 17 Oct 18:45Z: get_curiosity_queue threw
 * „gatePassablePool: canceling statement due to statement timeout". The
 * holder set — „tens of them, never thousands" — read 6,277 accounts, 6,204
 * of them test seats left by the load runs. A seat's phonebook is fiction and
 * vouches for nobody.
 */
describe('the accounts that vouch for a target', () => {
  it('leave out the seats made by the route', () => {
    expect(sql).toContain('NOT EXISTS (SELECT 1 FROM test_seats ts WHERE ts.user_id = u.id)');
  });

  it('leave out the fictional accounts that live in source', () => {
    expect(sql).toContain('u.id <> ALL($3::int[])');
    expect(fn).toContain('fictionalTestAccountIds().map(Number)');
  });
});
