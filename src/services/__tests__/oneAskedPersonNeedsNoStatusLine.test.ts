import { linesUnderReply, peopleAskedOnGoal } from '../askStatusSection';

/** D714 (the founder, 7 Oct): the per-person lines only when several people were asked. */
describe('the lines under a goal reply', () => {
  const LINES = ['ნინო: კითხვა მიუვიდა, პასუხს ველოდები'];

  it('are dropped when one person was asked', () => {
    expect(peopleAskedOnGoal([{ to_user_id: 5 }, { to_user_id: 5 }], [])).toBe(1);
    expect(linesUnderReply(LINES, 1)).toEqual([]);
  });

  it('stay when several were asked, held questions counted', () => {
    const held = [{ to_user_id: 9, contact_name: 'დათო', reopens_at: '2026-10-08T05:30:00Z' }];
    expect(peopleAskedOnGoal([{ to_user_id: 5 }], held)).toBe(2);
    expect(linesUnderReply(LINES, 2)).toEqual(LINES);
  });
});
