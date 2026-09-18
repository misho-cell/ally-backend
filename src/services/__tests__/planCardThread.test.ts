jest.mock('../../db/postgres/client', () => ({ __esModule: true, query: jest.fn(), default: {} }));
jest.mock('../../config/anthropic', () => ({ __esModule: true, default: {} }));

import { planCardIsForAnotherThread } from '../chat.service';

/**
 * Ticket 19 [4], the door nobody guarded — read off the live log, 18 September.
 *
 * Thread 17491 held goal 5446 (electrician). A second need was typed into it.
 * The run called get_my_tasks, saw the owner already had goal 5248 (accountant,
 * thread 17326), and proposed a plan for THAT goal — then put „ვამტკიცებ" under
 * it, in the electrician conversation. Approving there approves a plan
 * belonging to a chat the owner is not looking at, and approving is what sends
 * asks in their name. Nothing went out: task_asks for both goals was empty.
 *
 * create_task had carried this rule since ticket 19. propose_task_plan never
 * did, so it held for goals the model CREATES and not for goals it REUSES.
 */
describe('a plan card drawn in a chat the goal does not live in', () => {
  it('is refused, and says where the goal actually is', () => {
    const refusal = planCardIsForAnotherThread(17326, 'I need a good accountant', 17491);

    expect(refusal).not.toBeNull();
    expect(refusal?.['proposed']).toBe(false);
    expect(refusal?.['goal_lives_on_thread_id']).toBe(17326);
    expect(refusal?.['goal_title']).toBe('I need a good accountant');
  });

  it('tells the model not to retry, because a refusal it retries is not a guard', () => {
    const refusal = planCardIsForAnotherThread(17326, 'x', 17491);

    expect(String(refusal?.['error'])).toContain('Do NOT call this again');
    // And it must not read as „drop the work" — the leads still reach the owner.
    expect(String(refusal?.['error'])).toContain('leads');
  });

  it('allows the ordinary case: the goal is on the thread being written in', () => {
    expect(planCardIsForAnotherThread(17491, 'x', 17491)).toBeNull();
  });

  it('allows a goal with no home chat — the engine and asks open those', () => {
    expect(planCardIsForAnotherThread(null, 'x', 17491)).toBeNull();
  });

  it('allows a run with no thread at all, which is drawing a card for nobody', () => {
    expect(planCardIsForAnotherThread(17326, 'x', undefined)).toBeNull();
  });

  it('does not refuse the split, whose child run IS on the new goal thread', () => {
    // create_task moves the goal to a fresh thread and the child turn proposes
    // the plan there. That is the shape this guard must never break.
    const childThread = 17065;
    expect(planCardIsForAnotherThread(childThread, 'catering', childThread)).toBeNull();
  });
});
