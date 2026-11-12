import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * 3730 (2) / #8779 (ops 18:45Z, 5 Nov): a follow-up „ask X" in a goal must not open a
 * second goal. That used to hang on a reading of the owner's words (an instruction
 * reader); now it hangs on structure: while the conversation has an open goal,
 * create_task is held. propose_task_plan is never held — a plan change is legal.
 */
describe('one open goal per conversation', () => {
  const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');

  it('holds create_task only while the conversation has an open goal', () => {
    const at = chat.indexOf('const threadHoldsAGoal =');
    expect(at).toBeGreaterThan(0);
    expect(chat.slice(at, at + 300)).toContain('await getOpenTaskByThread(thread.id)');
    expect(chat).toContain('const createTaskHeld = !ownerAbsent && threadHoldsAGoal;');
    expect(chat).toContain('createTaskHeld && tool.name === CREATE_TASK_TOOL_NAME');
  });

  it('no longer reads the owner’s words for it', () => {
    expect(chat).not.toContain('isFollowUpInGoal');
    expect(chat).not.toContain('NEW_GOAL_TOOL_NAMES');
  });
});
