const mockQuery = jest.fn();
jest.mock('../../db/postgres/client', () => ({
  __esModule: true,
  query: (...a: unknown[]) => mockQuery(...a),
}));
const mockSave = jest.fn();
jest.mock('../threads.service', () => ({
  saveServerLine: (...a: unknown[]) => mockSave(...a),
  userLanguage: async () => 'ka',
}));
const mockEmit = jest.fn();
jest.mock('../sse.service', () => ({ emitMessageAppended: (...a: unknown[]) => mockEmit(...a) }));
jest.mock('../notification.service', () => ({ sendPushNotification: jest.fn(async () => true) }));

import { readFileSync } from 'fs';
import { join } from 'path';
import { AdditionOutcome, addToWaitingRequest, additionLine } from '../requestAddition.service';

/**
 * Giorgi, 9 Nov: a detail for a go-between whose request was still waiting was
 * refused as „already sent". It now reaches them in that request's thread.
 */
beforeEach(() => {
  jest.clearAllMocks();
  mockSave.mockResolvedValue({ id: 5, content: 'x', createdAt: '2026-11-09T18:00:00.000Z' });
});

describe('a detail added to a waiting request', () => {
  it('goes into the go-between’s thread of that request, as an addition', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ mediator_user_id: 7, mediator_thread_id: 70, message: 'გაცნობა თემურთან' }],
    });
    await expect(addToWaitingRequest(11, 'პროექტი ბათუმშია')).resolves.toBe(AdditionOutcome.Added);
    expect(mockSave).toHaveBeenCalledWith(70, 7, 'დაზუსტება ამ მოთხოვნაზე: პროექტი ბათუმშია');
    expect(mockEmit).toHaveBeenCalled();
    expect(String(mockQuery.mock.calls[0][0])).toContain("ir.status = 'pending'");
  });

  it('is not sent when it only repeats the request', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ mediator_user_id: 7, mediator_thread_id: 70, message: 'გაცნობა თემურთან.' }],
    });
    await expect(addToWaitingRequest(11, 'გაცნობა თემურთან')).resolves.toBe(
      AdditionOutcome.SameAsBefore,
    );
    expect(mockSave).not.toHaveBeenCalled();
  });

  it('is not sent when the request is no longer waiting', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    await expect(addToWaitingRequest(11, 'x')).resolves.toBe(AdditionOutcome.NoThread);
  });

  it('reads in the go-between’s language', () => {
    expect(additionLine('en', ' Batumi ')).toBe('An addition to this request: Batumi');
  });

  it('is offered only in the owner’s own turn, for a request not yet answered', () => {
    const tool = readFileSync(join(__dirname, '..', 'tools', 'requestIntroduction.ts'), 'utf8');
    expect(tool).toContain(
      "if (!alreadyAnswered && context.ownerAsked === true && addition !== '') {",
    );
  });
});
