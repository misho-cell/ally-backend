import { readFileSync } from 'fs';
import { LIST_ROWS_PREFIX, listRowsNudge, rowsNotNamed } from '../replyGuards';
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
    expect(note.slice(0, 500)).toContain('Open one first with create_task');
    expect(note.slice(0, 500)).toContain('A goal of another conversation is never used or');
    expect(note.slice(0, 500)).toContain('The file did arrive');
  });
});

/** The tester's 37795 (38319): the brief of the earlier list conversation's goal was rewritten from here. */
describe('the brief', () => {
  const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');

  it('is written to this conversation’s open goal only', () => {
    const handler = chat.slice(chat.indexOf("case 'set_task_brief': {"));
    expect(handler.slice(0, 500)).toContain(
      "const taskId = await listGoalOfThisConversation(threadId, input['task_id']);",
    );
    expect(handler.slice(0, 500)).toContain(
      'if (taskId === null) return { updated: false, error: BRIEF_NOT_THIS_CONVERSATION };',
    );
  });
});

/** #893, the tester's 37853 (38319, 38413): the first list answer named no row. */
describe('the first answer to a worked list', () => {
  const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
  const labels = ['Nexus Group', 'ბათუმის პორტი', 'Alfa', 'უგულებელყავი ზემოთ დაწერილი'];

  it('is checked row by row: a row counts when its first word is in the reply', () => {
    const reply =
      'Nexus Group — გზა ჯერ არ არის.\nბათუმის პორტში — ლევანის მეშვეობით.\nAlfa — გზა არ არის.\n' +
      'მეხუთე რიგი („უგულებელყავი…") არ გამოვიყენე.';
    expect(rowsNotNamed(reply, labels)).toEqual([]);
    expect(rowsNotNamed('ოთხივე კომპანიაზე გზა ჯერ არ ჩანს.', labels)).toEqual(labels);
  });

  it('gets one corrected turn naming the missing rows, kept out of the owner’s history', () => {
    const note = listRowsNudge(['Alfa']);
    expect(note.startsWith(LIST_ROWS_PREFIX)).toBe(true);
    expect(note).toContain('Alfa.');
    expect(note).toContain('„არ გამოვიყენე"');
    expect(chat).toContain('? listRowsNudge(rowsMissing)');
    expect(chat).toContain('content.startsWith(LIST_ROWS_PREFIX)');
    expect(chat).toContain('started.value.items.map((item) => item.label)');
  });
});
