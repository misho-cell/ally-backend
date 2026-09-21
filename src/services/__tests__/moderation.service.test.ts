jest.mock('../costLedger.service', () => ({
  __esModule: true,
  recordClaudeUsage: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../../config/anthropic', () => ({
  __esModule: true,
  default: { messages: { create: jest.fn() } },
}));

import anthropic from '../../config/anthropic';
import { isReplySafe, moderateReply } from '../moderation.service';

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

/**
 * Row 76, and the seat's 407 §5a — a block nobody could diagnose.
 *
 * 21 September, thread 20857: a plain Georgian question about Tbilisi's office
 * districts. Blocked at 15:37:00 after 75 seconds, twenty tokens spent on an
 * answer nobody read, and „repeat it" produced a full answer a minute later —
 * so the text was fine. The whole record left behind was:
 *
 *   [moderation] run dad8bba4 thread 20857 reply blocked by content filter (len=1148)
 *
 * „A record that says something happened and not what" — a phrase already in
 * this codebase for rows 125, 126 and 202, and in the officeholder gate three
 * lines above the call this fixes.
 */
describe('a refusal says which category it was', () => {
  beforeEach(() => mockCreate.mockReset());

  it('names the category when both votes refuse', async () => {
    mockCreate.mockResolvedValue(verdictResponse('UNSAFE: harassment'));
    await expect(moderateReply('x', '501')).resolves.toEqual({
      safe: false,
      reason: 'harassment',
    });
  });

  /**
   * Two votes blocking for DIFFERENT reasons is itself the shape of a false
   * block — the classifier is guessing — so both are reported rather than the
   * first one winning silently.
   */
  it('reports both when the two votes disagree about why', async () => {
    mockCreate
      .mockResolvedValueOnce(verdictResponse('UNSAFE: sexual'))
      .mockResolvedValueOnce(verdictResponse('UNSAFE: dangerous'));
    await expect(moderateReply('x', '501')).resolves.toEqual({
      safe: false,
      reason: 'sexual+dangerous',
    });
  });

  it('says unnamed rather than guessing when it gives no category', async () => {
    mockCreate.mockResolvedValue(verdictResponse('UNSAFE'));
    await expect(moderateReply('x', '501')).resolves.toEqual({ safe: false, reason: 'unnamed' });
  });

  /** One vote is still not a block — the rule that predates this. */
  it('carries no reason when the second vote clears it', async () => {
    mockCreate
      .mockResolvedValueOnce(verdictResponse('UNSAFE: hate'))
      .mockResolvedValueOnce(verdictResponse('SAFE'));
    await expect(moderateReply('x', '501')).resolves.toEqual({ safe: true });
  });

  /** Still fails open: a classifier that cannot be reached withholds nothing. */
  it('is safe with no reason when the call throws', async () => {
    mockCreate.mockRejectedValue(new Error('down'));
    await expect(moderateReply('x', '501')).resolves.toEqual({ safe: true });
  });

  /** The content itself never leaves this module. */
  it('returns a category and never the text', async () => {
    mockCreate.mockResolvedValue(verdictResponse('UNSAFE: sexual'));
    const out = await moderateReply('a reply about office districts in Tbilisi', '501');
    expect(JSON.stringify(out)).not.toContain('office districts');
  });
});
