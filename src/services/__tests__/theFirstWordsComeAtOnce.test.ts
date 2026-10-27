jest.mock('../../db/postgres/client', () => ({ __esModule: true, query: jest.fn() }));
jest.mock('../threads.service', () => ({
  __esModule: true,
  saveServerLine: jest
    .fn()
    .mockResolvedValue({ id: 81, content: 'saved', createdAt: '2026-10-27T15:30:00.000Z' }),
}));
jest.mock('../sse.service', () => ({ __esModule: true, emitMessageAppended: jest.fn() }));

import { query } from '../../db/postgres/client';
import { saveServerLine } from '../threads.service';
import { emitMessageAppended } from '../sse.service';
import { forgetWorkingLineRun, postFirstLine, postWorkingLineOnce } from '../workingLine.service';

/**
 * #8053 (founder 27 Oct): a user waited 1–2 minutes of searching without
 * knowing the request was understood. The text beside the first search is
 * posted at once as a real line, and the canned line is not added after it.
 */
const mockQuery = query as jest.MockedFunction<typeof query>;
const mockSave = saveServerLine as jest.MockedFunction<typeof saveServerLine>;
const mockEmit = emitMessageAppended as jest.MockedFunction<typeof emitMessageAppended>;
const ACK = 'ვამოწმებ ვაკეში ელექტრიკოსებს შენს წრეში — რამდენიმე წუთში მოგწერ.';

beforeEach(() => {
  jest.clearAllMocks();
  mockSave.mockResolvedValue({ id: 81, content: ACK, createdAt: '2026-10-27T15:30:00.000Z' });
});

describe('the first words of a run (#8053)', () => {
  it('are saved as their own line and shown at once', async () => {
    expect(await postFirstLine('118509', 69977, 'run-1', ACK)).toBe(true);

    expect(mockSave).toHaveBeenCalledWith(69977, 118509, ACK);
    expect(mockEmit).toHaveBeenCalledWith(
      '118509',
      69977,
      'run-1',
      expect.objectContaining({ messageId: '81', kind: 'working', content: ACK }),
    );
    forgetWorkingLineRun('run-1');
  });

  it('stand in for the canned line in the same run', async () => {
    await postFirstLine('118509', 69977, 'run-2', ACK);
    jest.clearAllMocks();

    expect(await postWorkingLineOnce('118509', 69977, 'run-2', 'ka')).toBe(false);
    expect(mockQuery).not.toHaveBeenCalled();
    expect(mockSave).not.toHaveBeenCalled();
    forgetWorkingLineRun('run-2');
  });

  it('leave the canned line due when they could not be written', async () => {
    mockSave.mockRejectedValueOnce(new Error('db down'));
    jest.spyOn(console, 'error').mockImplementation(() => undefined);

    expect(await postFirstLine('118509', 69977, 'run-3', ACK)).toBe(false);
    mockQuery.mockResolvedValueOnce({ rows: [{ due: true }], rowCount: 1 } as never);
    expect(await postWorkingLineOnce('118509', 69977, 'run-3', 'ka')).toBe(true);
    forgetWorkingLineRun('run-3');
  });
});
