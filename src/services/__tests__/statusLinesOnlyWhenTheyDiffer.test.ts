import { linesUnderReply, statusesDiffer, type StatedAsk } from '../askStatusSection';

/**
 * D714, then D722 (the founder, 7 Oct): a line per person only when several
 * people were asked and they stand differently.
 */
const NOW = new Date('2026-10-07T12:00:00Z');
const LINES = ['ნინო: კითხვა მიუვიდა, პასუხს ველოდები'];

function sent(toUserId: number): StatedAsk {
  return { to_user_id: toUserId, to_name: null, status: 'pending' };
}

describe('the lines under a goal reply', () => {
  it('are dropped when one person was asked', () => {
    expect(statusesDiffer([sent(5), sent(5)], [], NOW)).toBe(false);
  });

  it('are dropped when several were asked and all stand the same', () => {
    expect(statusesDiffer([sent(5), sent(6), sent(7)], [], NOW)).toBe(false);
  });

  it('stay when several were asked and they stand differently', () => {
    const held = [{ to_user_id: 9, contact_name: 'დათო', reopens_at: '2026-10-08T05:30:00Z' }];
    expect(statusesDiffer([sent(5)], held, NOW)).toBe(true);
  });

  it('pass the lines through only when the statuses differ', () => {
    expect(linesUnderReply(LINES, true)).toEqual(LINES);
    expect(linesUnderReply(LINES, false)).toEqual([]);
  });
});
