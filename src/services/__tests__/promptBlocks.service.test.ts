jest.mock('../../db/postgres/client', () => ({ query: jest.fn(), __esModule: true }));

import { query } from '../../db/postgres/client';
import { composePromptBlocks, upsertPromptBlock, isValidBlockName } from '../promptBlocks.service';

const mockQuery = query as jest.MockedFunction<typeof query>;

function rows(data: unknown[]): { rows: unknown[]; rowCount: number } {
  return { rows: data, rowCount: data.length };
}

beforeEach(() => jest.clearAllMocks());

describe('composePromptBlocks', () => {
  it('joins blocks in the REQUESTED order, not database order', async () => {
    mockQuery.mockResolvedValue(
      rows([
        { name: 'b', content: 'SECOND' },
        { name: 'a', content: 'FIRST' },
      ]) as never,
    );

    const composed = await composePromptBlocks(['a', 'b']);

    expect(composed).toBe('\n\nFIRST\n\nSECOND');
  });

  it('skips missing and empty blocks — unconfigured modes cost nothing', async () => {
    mockQuery.mockResolvedValue(rows([{ name: 'a', content: '   ' }]) as never);

    expect(await composePromptBlocks(['a', 'missing'])).toBe('');
  });

  it('returns empty without querying for an empty request', async () => {
    expect(await composePromptBlocks([])).toBe('');
    expect(mockQuery).not.toHaveBeenCalled();
  });
});

describe('upsertPromptBlock', () => {
  it('upserts by name', async () => {
    mockQuery.mockResolvedValue(
      rows([{ name: 'quick_answer', content: 'x', updated_at: 'now' }]) as never,
    );

    const block = await upsertPromptBlock('quick_answer', 'x');

    expect(block.name).toBe('quick_answer');
    expect(mockQuery.mock.calls[0][0]).toContain('ON CONFLICT (name) DO UPDATE');
  });

  it('rejects invalid names and oversized content', async () => {
    await expect(upsertPromptBlock('Bad Name!', 'x')).rejects.toThrow('invalid block name');
    await expect(upsertPromptBlock('ok_name', 'y'.repeat(20_001))).rejects.toThrow('too long');
    expect(mockQuery).not.toHaveBeenCalled();
  });
});

describe('isValidBlockName', () => {
  it.each([
    ['quick_answer', true],
    ['task_step', true],
    ['a', false],
    ['UPPER', false],
    ['has space', false],
  ])('%s → %s', (name, expected) => {
    expect(isValidBlockName(name)).toBe(expected);
  });
});
