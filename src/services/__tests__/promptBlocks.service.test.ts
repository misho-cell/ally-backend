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
  isValidBlockName,
  isRunMode,
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

    expect(await composeBlocksForMode('task_step', '1')).toEqual({ text: '', names: [] });
  });

  it('degrades to no blocks on a DB error — never fails the run', async () => {
    mockQuery.mockRejectedValue(new Error('boom'));

    expect(await composeBlocksForMode('onboarding', '1')).toEqual({ text: '', names: [] });
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
    stubCatalog(null, [
      block({ name: 'big', content: 'z'.repeat(25_000), modes: ['quick_answer'] }),
      block({ name: 'off', content: 'z'.repeat(25_000), modes: ['quick_answer'], enabled: false }),
    ]);

    const attempt = upsertPromptBlock('more', {
      content: 'y'.repeat(6_000),
      modes: ['quick_answer'],
    });

    // 25k (enabled 'big'; disabled 'off' does not count) + 6k > 30k ceiling.
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
