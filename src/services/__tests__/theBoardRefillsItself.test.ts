jest.mock('../../db/postgres/client', () => ({ __esModule: true, query: jest.fn() }));
jest.mock('../handoff.service', () => ({
  __esModule: true,
  HandoffAuthor: { ClaudeBackend: 'claude_backend' },
  postHandoff: jest.fn().mockResolvedValue({}),
}));

import { query } from '../../db/postgres/client';
import { postHandoff } from '../handoff.service';
import {
  isDecisionOnly,
  isPromptTask,
  PAGE_TWO_TARGET,
  planMoves,
  refillBoardOnce,
} from '../teamTaskRefill.service';

const mockQuery = query as jest.MockedFunction<typeof query>;
const mockPost = postHandoff as jest.MockedFunction<typeof postHandoff>;

const row = (
  id: number,
  task: string,
  problem = 'p',
): { id: number; problem: string; task: string } => ({
  id,
  problem,
  task,
});

beforeEach(() => jest.clearAllMocks());

/** Board #562 — Misho's page kept full from Giorgi's, on the server. */
describe('what comes up from Giorgi’s page', () => {
  it('fills Misho’s page to the target, in queue order', () => {
    const queue = [row(1, 'build a'), row(2, 'build b'), row(3, 'build c')];
    expect(planMoves(queue, PAGE_TWO_TARGET - 2).toMisho).toEqual([1, 2]);
    expect(planMoves(queue, PAGE_TWO_TARGET).toMisho).toEqual([]);
  });

  it('sends a prompt task to Tornike’s Claude’s page, never to Misho’s', () => {
    const queue = [row(5, 'FOR TORNIKE’S CLAUDE: shorten the plan'), row(6, 'build')];
    expect(planMoves(queue, 0)).toEqual({ toMisho: [6], toTornikesClaude: [5] });
    expect(isPromptTask(row(7, 'x', "Prompt work for Tornike's Claude"))).toBe(false);
    expect(isPromptTask(row(8, "for tornike's claude — a rule"))).toBe(false);
  });

  it('leaves a decision-only row where it is', () => {
    expect(isDecisionOnly(row(9, 'Decide (Giorgi): allow short reminders'))).toBe(true);
    expect(isDecisionOnly(row(10, 'Product decision for Giorgi: a company base'))).toBe(true);
    expect(isDecisionOnly(row(11, 'Done when: the receipt arrives'))).toBe(false);
    expect(planMoves([row(9, 'Decide (Giorgi): x'), row(12, 'build')], 0).toMisho).toEqual([12]);
  });
});

describe('one pass', () => {
  it('moves only rows still to build on Giorgi’s page, and says so once', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ n: String(PAGE_TWO_TARGET - 1) }] } as never)
      .mockResolvedValueOnce({ rows: [row(21, 'build'), row(22, 'build too')] } as never)
      .mockResolvedValueOnce({ rows: [{ id: 21 }] } as never);

    expect(await refillBoardOnce()).toEqual({ toMisho: [21], toTornikesClaude: [] });
    const [sql, params] = mockQuery.mock.calls[2];
    expect(String(sql)).toContain("page = $3 AND status = 'to_build' AND deleted_at IS NULL");
    expect(params).toEqual([[21], 2, 1]);
    expect(mockPost).toHaveBeenCalledTimes(1);
    expect(String(mockPost.mock.calls[0][1])).toContain('#21');
  });

  it('writes nothing and posts nothing when the page is full', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ n: String(PAGE_TWO_TARGET) }] } as never)
      .mockResolvedValueOnce({ rows: [row(21, 'build')] } as never);

    expect(await refillBoardOnce()).toEqual({ toMisho: [], toTornikesClaude: [] });
    expect(mockQuery).toHaveBeenCalledTimes(2);
    expect(mockPost).not.toHaveBeenCalled();
  });
});
