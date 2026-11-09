import { createTaskFollowUp } from '../chat.service';

/**
 * Retest 9 Nov (C2): „კი, მიდი" to „shall I ask Giorgi …?" opened a goal, and the
 * create_task result said „write nobody until the plan is approved" — so the run
 * proposed a plan and told the owner the question could not be sent.
 */
describe('the owner’s yes to an ask he was offered', () => {
  it('is read as the approval for that ask in his own turn', () => {
    const { next } = createTaskFollowUp(undefined, true) as { next: string };
    expect(next).toContain('that yes already approves that ask');
    expect(next).toContain('Never tell him it cannot be sent');
  });

  it('leaves a run the owner did not start waiting for the approved plan', () => {
    const { next } = createTaskFollowUp(undefined, false) as { next: string };
    expect(next).toContain('Write nobody and start nothing until the plan is approved.');
    expect(next).not.toContain('that yes already approves');
  });
});
