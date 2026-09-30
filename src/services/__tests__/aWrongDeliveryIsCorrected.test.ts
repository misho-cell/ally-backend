jest.mock('../../db/postgres/client', () => ({ __esModule: true, query: jest.fn() }));
jest.mock('../introduction.service', () => ({
  __esModule: true,
  deliverAcceptOutcome: jest.fn(),
  outcomeMessage: jest.fn(),
}));
jest.mock('../notification.service', () => ({
  __esModule: true,
  sendPushNotification: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../threads.service', () => ({
  __esModule: true,
  getThreadsByIntroRequestId: jest.fn(),
  saveThreadMessage: jest.fn().mockResolvedValue(undefined),
  userLanguage: jest.fn().mockResolvedValue('ka'),
}));

import { query } from '../../db/postgres/client';
import { deliverAcceptOutcome, outcomeMessage } from '../introduction.service';
import { sendPushNotification } from '../notification.service';
import { getThreadsByIntroRequestId, saveThreadMessage } from '../threads.service';
import { previewRedelivery, redeliverAcceptedIntroduction } from '../introRedelivery.service';

const mockQuery = query as jest.MockedFunction<typeof query>;
const mockDeliver = deliverAcceptOutcome as jest.MockedFunction<typeof deliverAcceptOutcome>;
const mockOutcome = outcomeMessage as jest.MockedFunction<typeof outcomeMessage>;
const mockThreads = getThreadsByIntroRequestId as jest.MockedFunction<
  typeof getThreadsByIntroRequestId
>;
const mockSave = saveThreadMessage as jest.MockedFunction<typeof saveThreadMessage>;

const ROW_1981 = {
  id: 1981,
  request_ref: 'req_1981',
  requester_user_id: 118509,
  mediator_user_id: 501,
  target_name: 'ილია',
  target_user_id: null,
  target_phone: '+12025550150',
  message: 'მჭირდება ადვოკატი',
  status: 'accepted',
  requester_task_id: 11023,
  origin_thread_id: null,
  intro_channel: 'direct',
};

function theBase(row: Record<string, unknown> | null): void {
  mockQuery.mockImplementation((sql: string) => {
    const text = String(sql);
    if (text.includes('FROM introduction_requests'))
      return Promise.resolve({ rows: row ? [row] : [], rowCount: row ? 1 : 0 } as never);
    if (text.includes('FROM "UserPhone"'))
      return Promise.resolve({ rows: [{ one: 1 }], rowCount: 1 } as never);
    return Promise.resolve({ rows: [{ name: 'tornike abuladze' }], rowCount: 1 } as never);
  });
}

/** Row 316 / §69: request 1981 was accepted and all three people were told it wrong. */
describe('a wrong delivery is corrected', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockThreads.mockResolvedValue([
      { id: 26435, user_id: 501, type: 'incoming_request' },
      { id: 26434, user_id: 118509, type: 'outgoing_request' },
    ] as never);
    mockDeliver.mockResolvedValue({
      requesterExtra: ' — ნომერი: +12025550150',
      mediatorFollowUp: 'მადლობა! გადავეცი კონტაქტი.',
      contactOutcome: 'handed_over',
    });
    mockOutcome.mockResolvedValue('ილიასთან გაცნობის მოთხოვნა მიღებულია.');
  });

  it('previews without writing anything and without the number', async () => {
    theBase(ROW_1981);
    const preview = await previewRedelivery(1981);
    expect(preview).toEqual(
      expect.objectContaining({ request_id: 1981, channel: 'direct', has_number: true }),
    );
    expect(JSON.stringify(preview)).not.toContain('2025550150');
    expect(mockDeliver).not.toHaveBeenCalled();
    expect(mockSave).not.toHaveBeenCalled();
  });

  it('runs the live delivery once and labels both corrections', async () => {
    theBase(ROW_1981);
    const result = await redeliverAcceptedIntroduction(1981);
    expect(result).toEqual({
      target_is_member: true,
      requester_corrected: true,
      mediator_corrected: true,
    });
    expect(mockDeliver).toHaveBeenCalledTimes(1);
    expect(mockDeliver.mock.calls[0][2]).toBe('direct');
    const lines = mockSave.mock.calls.map((c) => [c[0], String(c[3])]);
    expect(lines).toEqual([
      [26435, '**შესწორება:** მადლობა! გადავეცი კონტაქტი.'],
      [26434, '**შესწორება:** ილიასთან გაცნობის მოთხოვნა მიღებულია. — ნომერი: +12025550150'],
    ]);
    expect(sendPushNotification).toHaveBeenCalledTimes(1);
  });

  it('refuses anything that is not an accepted, mediated request', async () => {
    theBase(null);
    await expect(redeliverAcceptedIntroduction(1)).resolves.toBe('not_found');
    theBase({ ...ROW_1981, status: 'pending' });
    await expect(redeliverAcceptedIntroduction(1981)).resolves.toBe('not_accepted');
    theBase({ ...ROW_1981, mediator_user_id: null });
    await expect(redeliverAcceptedIntroduction(1981)).resolves.toBe('no_mediator');
    expect(mockDeliver).not.toHaveBeenCalled();
  });
});
