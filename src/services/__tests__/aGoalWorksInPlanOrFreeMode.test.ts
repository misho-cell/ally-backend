import { readFileSync } from 'fs';
import { join } from 'path';

const mockQuery = jest.fn();
jest.mock('../../db/postgres/client', () => ({
  __esModule: true,
  query: (...args: unknown[]) => mockQuery(...args),
}));

import {
  FREE_MODE_PEOPLE_PER_DAY,
  WorkMode,
  freeModeRoomFor,
  goalWorkMode,
  setGoalWorkMode,
  workModeFrom,
} from '../workMode';
import { OWNER_CONSENT_TOOL_NAMES } from '../chat.service';
import { SET_WORK_MODE_TOOL } from '../tools/setWorkMode';

/**
 * Misho, 8 Nov: a goal is worked by plan (the owner approves each plan, as
 * before) or free (his standing yes on the topic: plans start by themselves,
 * at most FREE_MODE_PEOPLE_PER_DAY new people a day, one evening report).
 */
const src = (file: string): string => readFileSync(join(__dirname, '..', file), 'utf8');

describe('the mode a goal is in', () => {
  beforeEach(() => mockQuery.mockReset());

  it('reads only the two modes', () => {
    expect(workModeFrom('free')).toBe(WorkMode.Free);
    expect(workModeFrom('plan')).toBe(WorkMode.Plan);
    expect(workModeFrom('anything')).toBeNull();
    expect(workModeFrom(undefined)).toBeNull();
  });

  it('is plan when the row says so, has no row, or cannot be read', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ work_mode: 'free' }] });
    await expect(goalWorkMode(7)).resolves.toBe(WorkMode.Free);
    mockQuery.mockResolvedValueOnce({ rows: [] });
    await expect(goalWorkMode(7)).resolves.toBe(WorkMode.Plan);
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    mockQuery.mockRejectedValueOnce(new Error('timeout'));
    await expect(goalWorkMode(7)).resolves.toBe(WorkMode.Plan);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('is set only on the owner’s own open goal', async () => {
    mockQuery.mockResolvedValueOnce({ rowCount: 1 });
    await expect(setGoalWorkMode('5', 7, WorkMode.Free)).resolves.toBe(true);
    const [sql, params] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain("user_id = $2 AND status = 'open'");
    expect(params).toEqual([7, '5', 'free']);
    mockQuery.mockResolvedValueOnce({ rowCount: 0 });
    await expect(setGoalWorkMode('6', 7, WorkMode.Free)).resolves.toBe(false);
  });
});

describe('free mode’s day of new people', () => {
  beforeEach(() => mockQuery.mockReset());

  it('has room while fewer than the limit were written to today', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ people: FREE_MODE_PEOPLE_PER_DAY - 1, already: false }],
    });
    await expect(freeModeRoomFor(7, 40)).resolves.toBe(true);
  });

  it('has no room for a new person once the limit is reached', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ people: FREE_MODE_PEOPLE_PER_DAY, already: false }],
    });
    await expect(freeModeRoomFor(7, 40)).resolves.toBe(false);
  });

  it('always has room for someone already written to today', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ people: FREE_MODE_PEOPLE_PER_DAY, already: true }],
    });
    await expect(freeModeRoomFor(7, 40)).resolves.toBe(true);
  });

  it('counts from the start of the local day', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ people: 0, already: null }] });
    await freeModeRoomFor(7, 40);
    const [sql, params] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain(
      "created_at >= (date_trunc('day', NOW() AT TIME ZONE $3) AT TIME ZONE $3)",
    );
    expect(params).toEqual([7, 40, 'Asia/Tbilisi']);
  });

  it('refuses the send at the one door every ask passes, only for a new top-level ask', () => {
    const asks = src('taskAsks.service.ts');
    expect(asks).toMatch(
      /parentAskId === undefined &&\s+fromOwnersLine !== true &&\s+\(await freeModeDayIsFull\(taskId, toUserId\)\)/,
    );
    expect(asks).toContain("reason: 'free_mode_day_full', error: FREE_MODE_DAY_IS_FULL");
  });
});

describe('the standing yes', () => {
  it('is given only by the owner, in his own turn', () => {
    expect(OWNER_CONSENT_TOOL_NAMES.has(SET_WORK_MODE_TOOL.name)).toBe(true);
  });

  it('approves a proposed plan only when the plan reaches someone', () => {
    const chat = src('chat.service.ts');
    expect(chat).toMatch(
      /return unreachable\.nobodyReachable\s+\? proposedResult\s+: approvedByFreeMode\(userId, taskId, runId, proposedResult\);/,
    );
    const helper = chat.slice(chat.indexOf('async function approvedByFreeMode('));
    expect(helper.indexOf('!== WorkMode.Free) return proposed;')).toBeGreaterThan(-1);
    expect(helper.indexOf('!== WorkMode.Free) return proposed;')).toBeLessThan(
      helper.indexOf("approveTaskPlan(userId, taskId, 'free_mode'"),
    );
  });

  it('the approve tool still starts day one through the same steps', () => {
    const chat = src('chat.service.ts');
    const approveCase = chat.slice(
      chat.indexOf("case 'approve_task_plan':"),
      chat.indexOf("case 'save_user_note':"),
    );
    expect(approveCase).toContain(
      "return startApprovedPlan(Number(input['task_id']), outcome.value, runId);",
    );
  });

  it('the migration keeps plan as the default', () => {
    const sql = readFileSync(
      join(__dirname, '..', '..', 'db', 'postgres', 'migrations', '301_task_work_mode.sql'),
      'utf8',
    );
    expect(sql).toContain("work_mode TEXT NOT NULL DEFAULT 'plan'");
    expect(sql).toContain("CHECK (work_mode IN ('plan', 'free'))");
  });
});
