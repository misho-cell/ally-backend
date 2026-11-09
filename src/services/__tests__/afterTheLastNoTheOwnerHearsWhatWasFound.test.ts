import { readFileSync } from 'fs';
import { join } from 'path';
import { searchedThisRun } from '../quietSystemRun';

const use = (name: string) => ({
  role: 'assistant' as const,
  content: [{ type: 'tool_use', name }],
});

/**
 * Retest 9 Nov (C6): after Gela's „no" the run searched the web, found three places and
 * planned them; the reply was dropped as a plan turn with nothing to say.
 */
describe('a run after the last „no"', () => {
  it('counts as having something to say when it looked for something', () => {
    expect(searchedThisRun([use('web_search'), use('propose_task_plan')])).toBe(true);
    expect(searchedThisRun([use('search_by_tag')])).toBe(true);
  });

  it('stays a quiet plan turn when it only saved the plan', () => {
    expect(searchedThisRun([use('propose_task_plan')])).toBe(false);
    expect(searchedThisRun([use('set_task_wake')])).toBe(false);
  });

  it('keeps the reply of such a run when its plan writes to nobody', () => {
    const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
    expect(chat).toContain(
      'ownerAbsent && !searchedThisRun(pending) && !(await lastAnswerAskedSomething(threadId))',
    );
  });
});
