jest.mock('../../db/postgres/client', () => ({ __esModule: true, query: jest.fn() }));

import { readFileSync } from 'fs';
import { join } from 'path';
import { query } from '../../db/postgres/client';
import { isFollowUpInGoal, NEW_GOAL_TOOL_NAMES } from '../followUpInGoal';

/** 3730 (2), IN-026: „ask Maia too" in the goal's own conversation opened a new goal. */
const mockQuery = query as jest.MockedFunction<typeof query>;
const FOLLOW_UP = 'ჰკითხე მაიას ისიც, როდის სცალია ბახვას ზარისთვის.';

function asked(value: boolean): void {
  mockQuery.mockResolvedValue({ rows: [{ asked: value }], rowCount: 1 } as never);
}

beforeEach(() => mockQuery.mockReset());

describe('isFollowUpInGoal', () => {
  it('is a follow-up when the open goal here has already asked somebody', async () => {
    asked(true);
    await expect(isFollowUpInGoal(47450, FOLLOW_UP)).resolves.toBe(true);
    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).toContain("k.thread_id = $1 AND k.status = 'open' AND a.status <> 'cancelled'");
    expect(params).toEqual([47450]);
  });

  it('is not one when the goal has asked nobody yet', async () => {
    asked(false);
    await expect(isFollowUpInGoal(47450, FOLLOW_UP)).resolves.toBe(false);
  });

  it('reads nothing for a line that asks no contact', async () => {
    await expect(isFollowUpInGoal(47450, 'რა ხდება?')).resolves.toBe(false);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('fails towards false when the read fails', async () => {
    mockQuery.mockRejectedValue(new Error('timeout'));
    await expect(isFollowUpInGoal(47450, FOLLOW_UP)).resolves.toBe(false);
  });

  it('holds the tools that open and plan a goal, in the owner run tools', () => {
    expect([...NEW_GOAL_TOOL_NAMES].sort()).toEqual(['create_task', 'propose_task_plan']);
    const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
    expect(chat).toContain(
      'const newGoalHeld = ownerAbsent || !(await isFollowUpInGoal(thread.id, userMessage));',
    );
    expect(chat).toContain('(newGoalHeld || !NEW_GOAL_TOOL_NAMES.has(tool.name)),');
  });
});
