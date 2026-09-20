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

/**
 * Goal 6073, a real account, 19 September — the refusal was right and it was
 * also the whole of what the run was told.
 *
 * The run proposed a plan for a goal living on another thread, was correctly
 * refused here, and told the owner „you already have this open elsewhere". Its
 * OWN goal, the one this conversation exists for, was left without a plan.
 * Twenty hours later it was still open, still planless, `next_wake_at` null.
 *
 * Row 208's lesson for the third time today: a refusal that only forbids
 * leaves nothing to write, so the model does the forbidden thing or nothing at
 * all. Here there IS a concrete instead, and the server is the only one that
 * knows it.
 */
describe('and what the run should do instead', () => {
  const OWN = { id: 6073, title: 'ნინიას უკვე მივწერე', hasPlan: false };

  it('names this thread’s own planless goal, by id', () => {
    const out = planCardIsForAnotherThread(999, 'somebody else’s goal', 18582, OWN);
    expect(out).not.toBeNull();
    expect(String(out?.error)).toContain('task_id 6073');
    expect(String(out?.error)).toContain('ნინიას უკვე მივწერე');
    // Machine-readable too, so the model need not parse the prose.
    expect(out?.propose_for_task_id).toBe(6073);
  });

  it('says to do it in the SAME turn — a planless goal must not wait for a wake', () => {
    const out = planCardIsForAnotherThread(999, 'x', 18582, OWN);
    expect(String(out?.error)).toContain('in this same turn');
  });

  it('stays silent when this thread’s goal already HAS a plan', () => {
    const out = planCardIsForAnotherThread(999, 'x', 18582, { ...OWN, hasPlan: true });
    expect(String(out?.error)).not.toContain('task_id 6073');
    expect(out?.propose_for_task_id).toBeUndefined();
  });

  it('stays silent when this thread has no goal of its own at all', () => {
    const out = planCardIsForAnotherThread(999, 'x', 18582, null);
    expect(out?.propose_for_task_id).toBeUndefined();
  });

  it('keeps every word of the refusal it already made', () => {
    const out = planCardIsForAnotherThread(999, 'x', 18582, OWN);
    expect(String(out?.error)).toContain('lives in another conversation');
    expect(String(out?.error)).toContain('Do NOT call this again for this task_id');
  });

  it('still lets a correct call through, which the parameter must not change', () => {
    expect(planCardIsForAnotherThread(18582, 'x', 18582, OWN)).toBeNull();
    expect(planCardIsForAnotherThread(null, 'x', 18582, OWN)).toBeNull();
    expect(planCardIsForAnotherThread(999, 'x', undefined, OWN)).toBeNull();
  });
});
