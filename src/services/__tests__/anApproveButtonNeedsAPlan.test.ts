jest.mock('../membersNoteScope', () => ({
  __esModule: true,
  goalStateOnThread: jest.fn(),
  membersNoteOutOfPlace: jest.fn(),
}));

import { goalStateOnThread } from '../membersNoteScope';
import { approvesNoSavedPlan, NO_PLAN_TO_APPROVE } from '../chat.service';

const mockGoal = goalStateOnThread as jest.MockedFunction<typeof goalStateOnThread>;

/**
 * The tester's 63427 (55786): „ვადასტურებ" was shown before any plan was saved,
 * so the first tap made the plan and a second identical card appeared.
 */
describe('an approve button', () => {
  beforeEach(() => mockGoal.mockReset());

  it('is refused where the conversation has no goal, or a goal with no plan', async () => {
    mockGoal.mockResolvedValueOnce(null);
    expect(await approvesNoSavedPlan(['ვადასტურებ', 'შევცვალოთ'], 55786, false)).toBe(true);
    mockGoal.mockResolvedValueOnce({ text: 'goal', hasPlan: false, open: true });
    expect(await approvesNoSavedPlan(['ვადასტურებ', 'შევცვალოთ'], 55786, false)).toBe(true);
    expect(NO_PLAN_TO_APPROVE).toContain('propose_task_plan');
  });

  it('is shown once a plan is saved', async () => {
    mockGoal.mockResolvedValueOnce({ text: 'goal', hasPlan: true, open: true });
    expect(await approvesNoSavedPlan(['ვადასტურებ', 'შევცვალოთ'], 55786, false)).toBe(false);
  });

  it('is not looked into for other buttons, or outside the owner’s own chat', async () => {
    expect(await approvesNoSavedPlan(['კი', 'არა'], 55786, false)).toBe(false);
    expect(await approvesNoSavedPlan(['ვადასტურებ'], 55786, true)).toBe(false);
    expect(await approvesNoSavedPlan(['ვადასტურებ'], undefined, false)).toBe(false);
    expect(mockGoal).not.toHaveBeenCalled();
  });
});
