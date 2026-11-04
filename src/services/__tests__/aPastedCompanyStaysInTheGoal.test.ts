jest.mock('../../db/postgres/client', () => ({ __esModule: true, query: jest.fn() }));
jest.mock('../../config/anthropic', () => ({ __esModule: true, default: {} }));

import { readFileSync } from 'fs';
import { join } from 'path';
import { SAME_CONVERSATION_GOAL_NEXT } from '../chat.service';

/** #8616: each pasted company became a goal of its own in a new conversation. */
describe('an item added to a goal’s conversation stays in that goal (#8616)', () => {
  const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
  const handler = chat.slice(chat.indexOf("case 'create_task': {"));

  it('refuses a second goal in an occupied conversation unless the owner said it is separate', () => {
    expect(handler).toContain("if (occupied !== null && input['separate'] !== true) {");
    expect(handler.indexOf('next: SAME_CONVERSATION_GOAL_NEXT')).toBeLessThan(
      handler.indexOf('let goalThreadId = threadId;'),
    );
  });

  it('tells the run to keep the item in the open goal', () => {
    expect(SAME_CONVERSATION_GOAL_NEXT).toContain('belongs to that goal');
    expect(SAME_CONVERSATION_GOAL_NEXT).toContain('separate: true');
  });
});
