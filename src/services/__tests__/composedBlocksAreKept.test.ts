jest.mock('../../db/postgres/client', () => ({
  query: jest.fn(),
  withTransaction: jest.fn(),
  __esModule: true,
}));

import { query as _query } from '../../db/postgres/client';
import { composeBlocksForMode, forgetComposedBlocks, PromptModel } from '../promptBlocks.service';

/**
 * 958: the GPT writer waited about a second for its blocks to be read. A
 * composition is kept for a short while and forgotten on every edit.
 */
const mockQuery = _query as jest.Mock;
const ROW = { name: 'voice', content: 'Speak warmly.', updated_at: '2026-10-08T00:00:00.000Z' };

beforeEach(() => {
  jest.clearAllMocks();
  forgetComposedBlocks();
});

describe('a composition of blocks is kept briefly (958)', () => {
  it('two runs in a row read the table once', async () => {
    mockQuery.mockResolvedValue({ rows: [ROW], rowCount: 1 });
    const first = await composeBlocksForMode('quick_answer', '7', PromptModel.Gpt);
    const second = await composeBlocksForMode('quick_answer', '7', PromptModel.Gpt);
    expect(second).toEqual(first);
    expect(first.text).toContain('Speak warmly.');
    expect(mockQuery).toHaveBeenCalledTimes(1);
  });

  it('another account, mode or model is its own read', async () => {
    mockQuery.mockResolvedValue({ rows: [ROW], rowCount: 1 });
    await composeBlocksForMode('quick_answer', '7', PromptModel.Gpt);
    await composeBlocksForMode('quick_answer', '8', PromptModel.Gpt);
    await composeBlocksForMode('quick_answer', '7', PromptModel.Claude);
    expect(mockQuery).toHaveBeenCalledTimes(3);
  });

  it('forgetting it reads again', async () => {
    mockQuery.mockResolvedValue({ rows: [ROW], rowCount: 1 });
    await composeBlocksForMode('quick_answer', '7', PromptModel.Gpt);
    forgetComposedBlocks();
    await composeBlocksForMode('quick_answer', '7', PromptModel.Gpt);
    expect(mockQuery).toHaveBeenCalledTimes(2);
  });

  it('a failed read runs on no blocks and is not kept', async () => {
    mockQuery.mockRejectedValueOnce(new Error('pool exhausted'));
    mockQuery.mockResolvedValue({ rows: [ROW], rowCount: 1 });
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const failed = await composeBlocksForMode('quick_answer', '7', PromptModel.Gpt);
    expect(failed).toEqual({ text: '', names: [], versions: [] });
    const next = await composeBlocksForMode('quick_answer', '7', PromptModel.Gpt);
    expect(next.text).toContain('Speak warmly.');
  });
});
