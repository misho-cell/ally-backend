import { readFileSync } from 'fs';
import { join } from 'path';
import { OWNER_INBOX_TOOL_NAMES, toolsForRun } from '../chat.service';

/**
 * The tester's 979 (G3): a wake on one goal posted the owner's OTHER waiting
 * items into that goal's thread — another goal's question, „also waiting: 6
 * questions and 2 results" — while nobody was there. The inbox tools are not
 * held by a run the owner did not start, so nothing is released into it.
 */
describe('a run the owner did not start holds no inbox tool', () => {
  const all = [
    { name: 'check_my_inbox' },
    { name: 'get_pending_updates' },
    { name: 'ask_contact' },
    { name: 'approve_task_plan' },
  ];

  it('drops the inbox tools (and the consent tools) from a wake run', () => {
    expect(toolsForRun(all, true).map((t) => t.name)).toEqual(['ask_contact']);
  });

  it('keeps them when the owner is there', () => {
    expect(toolsForRun(all, false)).toHaveLength(4);
  });

  it('names exactly the two that release what is waiting', () => {
    expect([...OWNER_INBOX_TOOL_NAMES]).toEqual(['check_my_inbox', 'get_pending_updates']);
  });

  it('refuses a call that arrives anyway, before anything is released', () => {
    const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
    const gate = chat.indexOf('if (ownerAbsent && OWNER_INBOX_TOOL_NAMES.has(name)) {');
    expect(gate).toBeGreaterThan(-1);
    expect(gate).toBeLessThan(chat.indexOf("case 'check_my_inbox': {"));
  });
});
