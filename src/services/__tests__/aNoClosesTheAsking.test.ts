import { readFileSync } from 'fs';
import { join } from 'path';
import { DECLINE_QUIET_HOURS } from '../taskAsks.service';

jest.mock('../../db/postgres/client', () => ({ query: jest.fn(), __esModule: true }));

/**
 * 4093 (the founder's find): „არ მცალია დამანებე თავი" was stored as an
 * answer, and the same asker's assistant then sent another question and a
 * reminder. Busy or „leave me alone" is a no, and a no closes the asking.
 */
describe('nothing more goes to somebody who said no', () => {
  const asks = readFileSync(join(__dirname, '..', 'taskAsks.service.ts'), 'utf8');

  it('quiets the same asker for two days', () => {
    expect(DECLINE_QUIET_HOURS).toBe(48);
  });

  it('refuses the system a new question or follow-up, never the owner in his own turn (#8155)', () => {
    const guard = asks.slice(asks.indexOf('// 4093: somebody who just said no'));
    const flat = guard.slice(0, 900).replace(/\s+/g, ' ');
    expect(flat).toContain(
      'fromOwnersLine !== true && ownerAskedNow !== true && (await declinedThisAskerRecently(fromUserId, toUserId))',
    );
    expect(guard.slice(0, 900)).toContain("reason: 'declined_recently'");
    const read = asks.slice(asks.indexOf('async function declinedThisAskerRecently('));
    expect(read.slice(0, 700)).toContain('from_user_id = $1::int AND to_user_id = $2');
    expect(read.slice(0, 700)).toContain('declined_at > NOW() - make_interval(hours => $3)');
  });

  it('sends no reminder to them either', () => {
    const due = asks.slice(asks.indexOf('export async function sendDueAskReminders('));
    expect(due.slice(0, 1800)).toContain('d.declined_at > NOW() - make_interval(hours => $2)');
    expect(due.slice(0, 3000)).toContain('[limit, DECLINE_QUIET_HOURS]');
  });
});
