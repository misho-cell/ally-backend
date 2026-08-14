jest.mock('../costLedger.service', () => ({
  __esModule: true,
  recordClaudeUsage: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../../config/anthropic', () => ({
  __esModule: true,
  default: { messages: { create: jest.fn() } },
}));

import anthropic from '../../config/anthropic';
import { isReplySafe } from '../moderation.service';

const mockCreate = anthropic.messages.create as jest.Mock;

function verdictResponse(verdict: string): unknown {
  return {
    content: [{ type: 'text', text: verdict }],
    usage: { input_tokens: 10, output_tokens: 1 },
  };
}

describe('isReplySafe', () => {
  beforeEach(() => {
    mockCreate.mockReset();
  });

  it('returns true on a SAFE first vote without a second call', async () => {
    mockCreate.mockResolvedValueOnce(verdictResponse('SAFE'));
    await expect(isReplySafe('დავუკავშირდი ლიკას და დათანხმდა.', '501')).resolves.toBe(true);
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });

  it('does not block on a single UNSAFE vote — a second SAFE vote overrides it', async () => {
    mockCreate
      .mockResolvedValueOnce(verdictResponse('UNSAFE'))
      .mockResolvedValueOnce(verdictResponse('SAFE'));
    await expect(isReplySafe('ლიკამ გიპასუხა: კი, დედაჩემი აცნობს.', '501')).resolves.toBe(true);
    expect(mockCreate).toHaveBeenCalledTimes(2);
  });

  it('blocks only when both independent votes say UNSAFE', async () => {
    mockCreate
      .mockResolvedValueOnce(verdictResponse('UNSAFE'))
      .mockResolvedValueOnce(verdictResponse('UNSAFE'));
    await expect(isReplySafe('genuinely harmful text', '501')).resolves.toBe(false);
    expect(mockCreate).toHaveBeenCalledTimes(2);
  });

  it('fails open when the moderation call errors', async () => {
    mockCreate.mockRejectedValue(new Error('api down'));
    await expect(isReplySafe('any reply', '501')).resolves.toBe(true);
  });

  it('fails open when the first vote is UNSAFE and the second errors', async () => {
    mockCreate
      .mockResolvedValueOnce(verdictResponse('UNSAFE'))
      .mockRejectedValueOnce(new Error('api down'));
    await expect(isReplySafe('any reply', '501')).resolves.toBe(true);
    expect(mockCreate).toHaveBeenCalledTimes(2);
  });

  it('treats empty text as safe without calling the API', async () => {
    await expect(isReplySafe('   ', '501')).resolves.toBe(true);
    expect(mockCreate).not.toHaveBeenCalled();
  });
});
