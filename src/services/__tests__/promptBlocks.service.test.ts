jest.mock('../../db/postgres/client', () => ({
  query: jest.fn(),
  withTransaction: jest.fn(),
  __esModule: true,
}));

import { query, withTransaction } from '../../db/postgres/client';
import {
  composeBlocksForMode,
  upsertPromptBlock,
  deletePromptBlock,
  computeModeTotals,
  modeBlockBudget,
  isValidBlockName,
  isRunMode,
  stampRunMode,
  PromptBlock,
} from '../promptBlocks.service';

const mockQuery = query as jest.MockedFunction<typeof query>;
const mockTx = withTransaction as jest.MockedFunction<typeof withTransaction>;

function rows(data: unknown[]): { rows: unknown[]; rowCount: number } {
  return { rows: data, rowCount: data.length };
}

function block(over: Partial<PromptBlock>): PromptBlock {
  return {
    name: 'b',
    content: 'x',
    modes: [],
    sort_order: 100,
    enabled: true,
    enabled_for_user_ids: [],
    updated_at: 'now',
    ...over,
  };
}

// A transaction stub that records every client query and returns the block row.
const txQueries: { sql: string; params: unknown[] }[] = [];
function stubTransaction(): void {
  mockTx.mockImplementation(async (cb) => {
    const client = {
      query: jest.fn((sql: string, params: unknown[]) => {
        txQueries.push({ sql, params });
        return Promise.resolve(rows([block({ name: 'quick_answer' })]));
      }),
    };
    return cb(client as never);
  });
}

// Route the two catalog reads by SQL shape (Once-queues proved order-fragile:
// a branch that legitimately skips a read desynchronizes every later test).
function stubCatalog(existing: PromptBlock | null, all: PromptBlock[]): void {
  mockQuery.mockImplementation(((sql: string) => {
    if (sql.includes('WHERE name = $1')) return Promise.resolve(rows(existing ? [existing] : []));
    if (sql.includes('ORDER BY name')) return Promise.resolve(rows(all));
    return Promise.resolve(rows([]));
  }) as never);
}

beforeEach(() => {
  jest.resetAllMocks();
  txQueries.length = 0;
  stubTransaction();
});

describe('composeBlocksForMode', () => {
  it('filters by mode/enabled/targeting in SQL and returns loaded names', async () => {
    mockQuery.mockResolvedValue(
      rows([
        { name: 'tone', content: 'VOICE' },
        { name: 'quick', content: 'FAST' },
      ]) as never,
    );

    const out = await composeBlocksForMode('quick_answer', '501');

    expect(out.text).toBe('\n\nVOICE\n\nFAST');
    expect(out.names).toEqual(['tone', 'quick']);
    const sql = mockQuery.mock.calls[0][0] as string;
    expect(sql).toContain('enabled = TRUE');
    expect(sql).toContain('$1 = ANY(modes)');
    expect(sql).toContain('cardinality(enabled_for_user_ids) = 0 OR $2::int = ANY');
    expect(sql).toContain('ORDER BY sort_order ASC, name ASC');
    expect(mockQuery.mock.calls[0][1]).toEqual(['quick_answer', '501']);
  });

  it('skips empty-content blocks entirely', async () => {
    mockQuery.mockResolvedValue(rows([{ name: 'a', content: '   ' }]) as never);

    expect(await composeBlocksForMode('task_step', '1')).toEqual({
      text: '',
      names: [],
      versions: [],
    });
  });

  it('degrades to no blocks on a DB error — never fails the run', async () => {
    mockQuery.mockRejectedValue(new Error('boom'));

    expect(await composeBlocksForMode('onboarding', '1')).toEqual({
      text: '',
      names: [],
      versions: [],
    });
  });
});

describe('upsertPromptBlock', () => {
  it('creates with full fields, snapshots history, trims to 10', async () => {
    stubCatalog(null, []);

    await upsertPromptBlock('quick_answer', {
      content: 'x',
      modes: ['quick_answer', 'onboarding'],
      sort_order: 5,
      enabled_for_user_ids: [501],
    });

    const upsert = txQueries.find((q) => q.sql.includes('ON CONFLICT (name) DO UPDATE'));
    expect(upsert?.params).toEqual([
      'quick_answer',
      'x',
      ['quick_answer', 'onboarding'],
      5,
      true,
      [501],
    ]);
    const history = txQueries.find((q) => q.sql.includes('INSERT INTO prompt_block_history'));
    expect(history?.params?.[1]).toBe('create');
    expect(txQueries.some((q) => q.sql.includes('DELETE FROM prompt_block_history'))).toBe(true);
  });

  it('merges a partial update over the existing row (disable only)', async () => {
    stubCatalog(block({ name: 'tone', content: 'KEEP', modes: ['task_step'], sort_order: 7 }), []);

    await upsertPromptBlock('tone', { enabled: false });

    const upsert = txQueries.find((q) => q.sql.includes('ON CONFLICT (name) DO UPDATE'));
    expect(upsert?.params).toEqual(['tone', 'KEEP', ['task_step'], 7, false, []]);
    const history = txQueries.find((q) => q.sql.includes('INSERT INTO prompt_block_history'));
    expect(history?.params?.[1]).toBe('update');
  });

  it('rejects invalid names, oversize content, unknown modes, bad user ids', async () => {
    await expect(upsertPromptBlock('Bad Name!', { content: 'x' })).rejects.toThrow(
      'invalid block name',
    );
    await expect(upsertPromptBlock('ok_name', { content: 'y'.repeat(30_001) })).rejects.toThrow(
      'too long',
    );
    await expect(
      upsertPromptBlock('ok_name', { content: 'x', modes: ['drafting'] }),
    ).rejects.toThrow('unknown mode');
    await expect(
      upsertPromptBlock('ok_name', { content: 'x', enabled_for_user_ids: [0] }),
    ).rejects.toThrow('positive integers');
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('rejects creating a block without content', async () => {
    stubCatalog(null, []);

    await expect(upsertPromptBlock('new_block', { modes: ['quick_answer'] })).rejects.toThrow(
      'content is required',
    );
  });

  it('enforces the per-mode ceiling against OTHER enabled blocks, naming the mode', async () => {
    // Derived from the live budget rather than a hardcoded 30k: the ceiling
    // moved once (20k → 30k → 40k) and this test pinned the old number, so it
    // stopped exercising the rule instead of failing loudly.
    const [{ budget_chars: budget }] = computeModeTotals([]);
    const existing = budget - 1_000;

    stubCatalog(null, [
      block({ name: 'big', content: 'z'.repeat(existing), modes: ['quick_answer'] }),
      block({
        name: 'off',
        content: 'z'.repeat(existing),
        modes: ['quick_answer'],
        enabled: false,
      }),
    ]);

    const attempt = upsertPromptBlock('more', {
      content: 'y'.repeat(2_000),
      modes: ['quick_answer'],
    });

    // The disabled block does not count; the enabled one plus 2k passes the top.
    await expect(attempt).rejects.toThrow(/quick_answer .* ceiling/);
  });

  it('a disabled block skips the ceiling (parking oversized drafts is allowed)', async () => {
    stubCatalog(null, [
      block({ name: 'big', content: 'z'.repeat(19_000), modes: ['quick_answer'] }),
    ]);

    await expect(
      upsertPromptBlock('draft', {
        content: 'y'.repeat(5_000),
        modes: ['quick_answer'],
        enabled: false,
      }),
    ).resolves.toBeDefined();
  });
});

describe('deletePromptBlock', () => {
  it('snapshots the pre-delete state, then deletes', async () => {
    stubCatalog(block({ name: 'old', content: 'BYE', modes: ['task_step'] }), []);

    expect(await deletePromptBlock('old')).toBe(true);

    const history = txQueries.find((q) => q.sql.includes('INSERT INTO prompt_block_history'));
    expect(history?.params?.[1]).toBe('delete');
    expect(history?.params?.[2]).toBe('BYE');
    expect(txQueries.some((q) => q.sql.includes('DELETE FROM prompt_blocks'))).toBe(true);
  });

  it('returns false for a missing block', async () => {
    stubCatalog(null, []);

    expect(await deletePromptBlock('ghost')).toBe(false);
    expect(mockTx).not.toHaveBeenCalled();
  });
});

describe('computeModeTotals', () => {
  it('sums only ENABLED blocks per mode', () => {
    const totals = computeModeTotals([
      block({ name: 'a', content: 'x'.repeat(100), modes: ['quick_answer', 'task_step'] }),
      block({ name: 'b', content: 'x'.repeat(50), modes: ['quick_answer'], enabled: false }),
    ]);

    const quick = totals.find((t) => t.mode === 'quick_answer');
    const task = totals.find((t) => t.mode === 'task_step');
    expect(quick?.enabled_chars).toBe(100);
    expect(task?.enabled_chars).toBe(100);
    expect(quick?.budget_chars).toBeGreaterThan(0);
  });
});

describe('name and mode validation', () => {
  it.each([
    ['quick_answer', true],
    ['task_step', true],
    ['a', false],
    ['UPPER', false],
    ['has space', false],
  ])('isValidBlockName(%s) → %s', (name, expected) => {
    expect(isValidBlockName(name)).toBe(expected);
  });

  it.each([
    ['quick_answer', true],
    ['incoming_ask', true],
    ['onboarding', true],
    ['drafting', false],
  ])('isRunMode(%s) → %s', (mode, expected) => {
    expect(isRunMode(mode)).toBe(expected);
  });
});

// Ticket 9 Task 26. The wall the prompt team hit was never the per-block cap:
// quick_answer held qa_main 19,825 + qa_rules_20_22 10,172 = 29,997 of 30,000,
// three characters of headroom, while a 20,286-char block saved fine on its
// own. Two different ceilings, one confusing message.
describe('the mode budget, and telling it apart from the per-block cap', () => {
  it('reports what is left, not just what is used', () => {
    const totals = computeModeTotals([
      {
        name: 'qa_main',
        content: 'x'.repeat(19_825),
        enabled: true,
        modes: ['quick_answer'],
      } as never,
      {
        name: 'qa_rules',
        content: 'x'.repeat(10_172),
        enabled: true,
        modes: ['quick_answer'],
      } as never,
    ]);

    const qa = totals.find((t) => t.mode === 'quick_answer');
    expect(qa?.enabled_chars).toBe(29_997);
    expect(qa?.remaining_chars).toBe(qa!.budget_chars - 29_997);
  });

  it('does not count a disabled block against the budget', () => {
    const totals = computeModeTotals([
      { name: 'off', content: 'x'.repeat(8_306), enabled: false, modes: ['quick_answer'] } as never,
    ]);

    expect(totals.find((t) => t.mode === 'quick_answer')?.enabled_chars).toBe(0);
  });
});

describe('which VERSION of a block answered (ticket 9 task 34)', () => {
  it('stamps name@updated_at per loaded block, beside the names', async () => {
    mockQuery.mockResolvedValue({
      rows: [
        {
          name: 'task_main',
          content: 'the goal rules',
          updated_at: new Date('2026-09-02T13:04:11.000Z'),
        },
      ],
      rowCount: 1,
    } as never);

    const out = await composeBlocksForMode('task_step', '501');

    // „task_main" alone cannot tell one tuning round from the round before it.
    expect(out.names).toEqual(['task_main']);
    expect(out.versions).toEqual(['task_main@2026-09-02T13:04:11.000Z']);
  });

  it('carries the versions into the stamp the run writes', async () => {
    mockQuery.mockResolvedValue({ rows: [], rowCount: 0 } as never);

    await stampRunMode(
      'run-1',
      '501',
      12345,
      'task_step',
      ['task_main'],
      ['task_main@2026-09-02T13:04:11.000Z'],
    );

    const [sql, params] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('block_versions');
    expect(params[5]).toEqual(['task_main@2026-09-02T13:04:11.000Z']);
  });
});

/**
 * Ticket 20 row 104 — the stamp said which BLOCK a run loaded and not which
 * base prompt sat underneath it.
 *
 * Blocks have carried `name@updated_at` since ticket 9 task 34. The base
 * prompt — the 25,176 characters every run loads before any block — carried
 * nothing, so „did this run see the new wording" was answerable for a block
 * and not for the thing the block is appended to.
 *
 * Asked for by the seat on 19 September while a base-prompt change the founder
 * had approved sat unpasted: „stamp which run first loaded it. We would rather
 * re-measure against the build boundary than against a wall clock, and after
 * last week neither of us should be inferring „it is live now" from a
 * timestamp." The week they mean includes two wrong readings of my own taken
 * off a clock.
 *
 * `ai_config` needed no new versioning: its edit route INSERTs a row per
 * change and every reader takes the highest id, so the id already is the
 * version.
 */
describe('the stamp records which base prompt the run was given', () => {
  it('writes the ai_config row id alongside the blocks', async () => {
    mockQuery.mockResolvedValue(rows([]) as never);

    await stampRunMode('run-2', '501', 12345, 'task_step', ['task_main'], [], 2047);

    const [sql, params] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('base_prompt_id');
    expect(params[6]).toBe(2047);
  });

  it('stamps null rather than a guess when the id is unknown', async () => {
    // Only reachable with an empty ai_config, which is a broken install — but
    // a wrong id here would be worse than an honest gap, because the whole
    // point of the column is to be trusted when a measurement disagrees with
    // a clock.
    mockQuery.mockResolvedValue(rows([]) as never);

    await stampRunMode('run-3', '501', null, 'quick_answer', [], [], null);

    expect((mockQuery.mock.calls[0] as [string, unknown[]])[1][6]).toBeNull();
  });

  it('defaults to null for a caller that has not been updated', async () => {
    mockQuery.mockResolvedValue(rows([]) as never);

    await stampRunMode('run-4', '501', null, 'quick_answer', []);

    expect((mockQuery.mock.calls[0] as [string, unknown[]])[1][6]).toBeNull();
  });
});

/**
 * Misho, 21 September: **„აუწიე 44000-ზე"** — raise it to 44,000.
 *
 * The seat tried the trim first, which is the right order. Four compression
 * passes on the Forty-eight rule lost the „when the count is one" clause and
 * two teaching examples and still landed at 39,999 of 40,000 — one character
 * of headroom and nothing left for the next rule. A ceiling that can only be
 * met by deleting the reasoning is not doing its job.
 *
 * PER MODE, and that part is mine rather than his. The global
 * `MODE_BLOCK_BUDGET_CHARS` is one variable for every mode, so raising it
 * would hand `task_step` 4,000 characters nobody asked for — it sits at 30,986
 * and has room. I told him that before he answered and recommended the split.
 */
describe('one mode may have more room than the others', () => {
  it('gives quick_answer 44,000 and leaves the rest at the default', () => {
    expect(modeBlockBudget('quick_answer')).toBe(44_000);
    expect(modeBlockBudget('task_step')).toBe(40_000);
    expect(modeBlockBudget('onboarding')).toBe(40_000);
  });

  /** A budget check is the wrong place to throw about a typo. */
  it('gives an unknown mode the default rather than an exception', () => {
    expect(modeBlockBudget('drafting')).toBe(40_000);
  });

  /**
   * The admin read must agree with the saver. Reporting 40,000 while the saver
   * enforces 44,000 sends the next editor to trim text that fits — which is
   * exactly the trimming this change exists to stop.
   */
  it('reports each mode its own ceiling, not the global one', () => {
    const totals = computeModeTotals([]);
    const quick = totals.find((t) => t.mode === 'quick_answer');
    const step = totals.find((t) => t.mode === 'task_step');
    expect(quick?.budget_chars).toBe(44_000);
    expect(quick?.remaining_chars).toBe(44_000);
    expect(step?.budget_chars).toBe(40_000);
  });
});
