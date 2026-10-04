import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * #1024 (the tester, 22:01Z, 38318): a quick answer with no goal worked the
 * list under the goal of an EARLIER list conversation, was refused, and told
 * the owner the file had not arrived — a minute after reading it.
 */
describe('the list tools', () => {
  const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');

  it('use this conversation’s open goal, whatever id the model passed', () => {
    const fn = chat.slice(chat.indexOf('async function listGoalOfThisConversation('));
    const body = fn.slice(0, fn.indexOf('\n}\n'));
    expect(body).toContain('const goal = await getOpenTaskByThread(threadId);');
    expect(body).toContain('return goal === null ? null : Number(goal.id);');
    const work = chat.slice(chat.indexOf("case 'work_the_list': {"));
    expect(work.slice(0, 300)).toContain(
      "const taskId = await listGoalOfThisConversation(threadId, input['task_id']);",
    );
    const status = chat.slice(chat.indexOf("case 'list_status': {"));
    expect(status.slice(0, 300)).toContain(
      "const taskId = await listGoalOfThisConversation(threadId, input['task_id']);",
    );
  });

  it('say how to open a goal when there is none, and that the file did arrive', () => {
    const note = chat.slice(chat.indexOf('const NO_GOAL_FOR_THE_LIST ='));
    expect(note.slice(0, 500)).toContain('Save it first with set_task_brief');
    expect(note.slice(0, 500)).toContain('The file did arrive');
  });
});
