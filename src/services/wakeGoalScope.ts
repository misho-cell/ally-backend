import type { Task } from './taskStore.service';

/**
 * Board #382 — a goal that wakes by itself writes about that goal alone.
 *
 * Tester 1013 fixed the owner's side: a new request one word away from an
 * open goal opens its own goal. The other half was the system's own runs. A
 * wake (a timer, an answer arriving, a held question released) runs on the
 * goal's conversation with nobody there, and its prompt still listed every
 * open goal the owner has. The model reads that list as news and reports it
 * in the goal's conversation: „the vet search is still waiting too…".
 *
 * Nothing about another goal belongs there: the owner did not ask, and each
 * goal has its own conversation where its news arrives. So a run the system
 * started on a conversation bound to one goal sees only that goal. A run the
 * owner started keeps the whole list, because „what else is open?" is theirs
 * to ask. A system run on a conversation with no goal keeps it too, since
 * there is no one goal to narrow to.
 */
export function goalsForRun(
  tasks: readonly Task[],
  boundTaskId: number | null,
  ownerAbsent: boolean,
): readonly Task[] {
  if (!ownerAbsent || boundTaskId === null) return tasks;
  return tasks.filter((task) => task.id === boundTaskId);
}
