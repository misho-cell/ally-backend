import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * 14 first tries in three days refused „Task not found or not open" (11–14 Oct):
 * the model called ask_contact with task_id 0 in a conversation with no goal
 * yet, and a round went on create_task before the same ask went again.
 */
const CHAT = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
const HELPER = CHAT.slice(CHAT.indexOf('async function taskForAsk('));
const BODY = HELPER.slice(0, HELPER.indexOf('\n}\n'));

describe('an ask with no usable goal id finds its goal (task_id 0)', () => {
  it('uses a real id as given', () => {
    expect(BODY).toContain(
      'if (Number.isFinite(taskId) && taskId > 0) return getTaskById(taskId);',
    );
  });

  it('takes the conversation’s open goal before anything else', () => {
    expect(BODY.indexOf('getOpenTaskByThread(threadId)')).toBeLessThan(
      BODY.indexOf('goalForInstruction('),
    );
  });

  it('opens a goal only for the owner’s instruction to ask someone, as the server’s send does', () => {
    expect(BODY).toContain('if (contactInstructionIn(ownerLine) === null) return null;');
    expect(BODY).toContain('goalForInstruction(userId, threadId, ownerLine)');
  });

  it('is what ask_contact uses, with the same refusal when nothing fits', () => {
    const ask = CHAT.slice(CHAT.indexOf("case 'ask_contact': {"));
    expect(ask.slice(0, 600)).toContain('await taskForAsk(');
    expect(ask.slice(0, 600)).toContain("error: 'Task not found or not open.'");
  });
});
