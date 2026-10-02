/**
 * Board #382: a goal that wakes by itself must not name another goal. A run
 * the system started on a goal's conversation is given that goal alone.
 */
import type { Task } from '../taskStore.service';
import { goalsForRun } from '../wakeGoalScope';

function goal(id: number, title: string): Task {
  return { id, title, status: 'open' } as Task;
}

const VET = goal(101, 'ვეტერინარი თბილისში');
const TUTOR = goal(102, 'მათემატიკის რეპეტიტორი ბათუმში');
const OPEN_GOALS: readonly Task[] = [VET, TUTOR];

describe('goalsForRun', () => {
  it('gives a system run on a goal conversation only that goal', () => {
    expect(goalsForRun(OPEN_GOALS, VET.id, true)).toEqual([VET]);
  });

  it('keeps every goal for a run the owner started', () => {
    expect(goalsForRun(OPEN_GOALS, VET.id, false)).toEqual(OPEN_GOALS);
  });

  it('keeps every goal for a system run on a conversation with no goal', () => {
    expect(goalsForRun(OPEN_GOALS, null, true)).toEqual(OPEN_GOALS);
  });

  it('gives an empty list when the woken goal is no longer open', () => {
    expect(goalsForRun([TUTOR], VET.id, true)).toEqual([]);
  });
});
