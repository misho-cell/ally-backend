jest.mock('../threadStatus.service', () => ({ __esModule: true, setThreadStatus: jest.fn() }));
jest.mock('../taskStore.service', () => ({ __esModule: true, threadAwaitsOwner: jest.fn() }));

import { setThreadStatus } from '../threadStatus.service';
import { threadAwaitsOwner } from '../taskStore.service';
import { markRunFailed } from '../runFailure.service';

const mockStatus = setThreadStatus as jest.MockedFunction<typeof setThreadStatus>;
const mockAwaits = threadAwaitsOwner as jest.MockedFunction<typeof threadAwaitsOwner>;

beforeEach(() => {
  jest.clearAllMocks();
  mockStatus.mockResolvedValue(undefined);
});

describe('markRunFailed', () => {
  it('files an ordinary broken run as failed', async () => {
    mockAwaits.mockResolvedValue(false);

    await markRunFailed('501', 9406);

    expect(mockStatus).toHaveBeenCalledWith('501', 9406, 'failed', {
      statusLine: 'შეფერხდა — სცადე თავიდან',
    });
  });

  it('leaves the badge on needs_you when the thread carries a goal waiting for the owner', async () => {
    // Thread 9406, 3 September: the question was registered six seconds before
    // the run died. The user has something to answer; „სცადე თავიდან" is not it.
    mockAwaits.mockResolvedValue(true);

    await markRunFailed('501', 9406);

    expect(mockStatus).toHaveBeenCalledWith('501', 9406, 'needs_you', {
      statusLine: 'შენი პასუხი სჭირდება',
      isTask: true,
    });
  });

  it('writes the caption in the conversation language', async () => {
    mockAwaits.mockResolvedValue(true);

    await markRunFailed('501', 9406, 'en');

    expect(mockStatus.mock.calls[0]?.[3]).toEqual({
      statusLine: 'Needs your answer',
      isTask: true,
    });
  });

  it('falls back to failed — the real event — when the goal check itself breaks', async () => {
    mockAwaits.mockRejectedValue(new Error('timeout'));

    await markRunFailed('501', 9406);

    expect(mockStatus.mock.calls[0]?.[2]).toBe('failed');
  });
});
