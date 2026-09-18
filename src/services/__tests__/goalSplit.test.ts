jest.mock('../../db/postgres/client', () => ({ __esModule: true, query: jest.fn(), default: {} }));
jest.mock('../../config/anthropic', () => ({ __esModule: true, default: {} }));

import { splitOpeningLine } from '../goalSplit';
import { createTaskFollowUp } from '../chat.service';

/**
 * Ticket 20 row 33. The tester's read of 15812: a second need typed into the
 * catering thread opened goal 3702 on thread 15814, and that thread then held
 * the plan and nothing else. The empty-thread half is fixed; this is the line
 * that says why the conversation exists at all.
 */
describe('the first line of a goal split out of another chat', () => {
  it('names the goal that was already running, so the split has a reason', () => {
    const line = splitOpeningLine('ქეითერინგი ოფისში', 'ka');

    expect(line).toContain('ქეითერინგი ოფისში');
    expect(line).toContain('ცალკე მიზნად');
  });

  it('follows the conversation’s language, like every other fixed string', () => {
    expect(splitOpeningLine('office catering', 'en')).toContain('a goal of its own');
    expect(splitOpeningLine('кейтеринг', 'ru')).toContain('отдельную цель');
    expect(splitOpeningLine('catering', 'es')).toContain('meta aparte');
  });

  it('carries no em dash and no bold, because it skips the storage scrubber', () => {
    // Ticket 11 Task 1 strips these from a reply on its way to the row. This
    // line is written straight to the thread and never passes that function.
    for (const lang of ['ka', 'en', 'ru', 'es'] as const) {
      const line = splitOpeningLine('X', lang);
      expect(line).not.toMatch(/—|\*\*|^#/m);
    }
  });

  it('survives a goal title that is empty, rather than writing a dangling quote', () => {
    // A title is required by create_task, but the line must not become
    // „already working on „"" if one ever arrives blank.
    expect(splitOpeningLine('', 'ka').length).toBeGreaterThan(40);
  });
});

/**
 * The split ran the same search twice — the seat's #4325, and the run ids
 * leave no room for doubt.
 *
 * For ONE typed need: thread 17064's parent ran eight tool calls and answered
 * at 31 seconds; thread 17065's child ran seven of its own and answered the
 * same thing at 3 minutes 11. Zero shared run ids, in both of that night's
 * splits. About fifteen tool calls, two network sweeps and two model runs for
 * one question, and the owner reads the answer twice — the second time three
 * minutes late.
 *
 * The cause was two instructions in one tool result. Row 101 tells the run to
 * propose the plan HERE, which is right when the goal stayed on this thread;
 * on a split it told the parent to do the child's work while the child's own
 * turn was already queued to do it properly.
 */
describe('what create_task tells the run to do next', () => {
  it('asks for the plan in THIS run when the goal stayed on this thread', () => {
    const followUp = createTaskFollowUp(undefined) as { next: string; thread_id?: number };

    expect(followUp.next).toContain('propose_task_plan');
    expect(followUp.thread_id).toBeUndefined();
  });

  it('tells the parent to STOP when the goal moved to its own thread', () => {
    const followUp = createTaskFollowUp(17065) as { next: string; thread_id: number };

    expect(followUp.thread_id).toBe(17065);
    expect(followUp.next).toContain('STOP WORKING ON THIS NEED');
    // The one that matters: the parent must not be told to plan it too.
    expect(followUp.next).not.toContain('propose_task_plan');
  });

  it('never sends both instructions at once, whichever branch runs', () => {
    // They contradict each other, and for two nights the split sent both.
    for (const movedTo of [undefined, 17065]) {
      const next = String((createTaskFollowUp(movedTo) as { next: string }).next);
      const plansHere = next.includes('propose_task_plan');
      const stopsHere = next.includes('STOP WORKING');
      expect(plansHere && stopsHere).toBe(false);
      expect(plansHere || stopsHere).toBe(true);
    }
  });

  it('still says where the goal went, which is the half that was working', () => {
    const followUp = createTaskFollowUp(17065) as { note: string };

    expect(followUp.note).toContain('its own');
  });
});
