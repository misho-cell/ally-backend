jest.mock('../../../db/postgres/client', () => ({ __esModule: true, query: jest.fn() }));
jest.mock('../../notification.service', () => ({
  __esModule: true,
  sendPushNotification: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../../threads.service', () => ({
  __esModule: true,
  createIncomingRequestThread: jest.fn().mockResolvedValue({ id: 27194, title: 'T68 → Nika' }),
  createOutgoingRequestThread: jest.fn().mockResolvedValue({ id: 27195, title: 'T65 → Nika' }),
}));
jest.mock('../../sse.service', () => ({ __esModule: true, emitThreadCreated: jest.fn() }));
jest.mock('../../askOptOut.service', () => ({
  __esModule: true,
  isOptedOutFromAsks: jest.fn().mockResolvedValue(false),
}));
jest.mock('../../privacyRights.service', () => ({
  __esModule: true,
  isPhoneOptedOut: jest.fn().mockResolvedValue(false),
}));
jest.mock('../../threadBackPointer.service', () => ({
  __esModule: true,
  linkRequestToEarlierAsk: jest.fn().mockResolvedValue(true),
}));
// Row 305 (b): these are the requests that continue NO open conversation — the
// earlier ask's conversation has ended, so two threads and the pointer lines
// are still the truth. The shared case is aFollowUpRequestStaysInTheConversation.
jest.mock('../../sharedRequestThread.service', () => ({
  __esModule: true,
  findSharedConversation: jest.fn().mockResolvedValue(null),
  writeRequestIntoConversation: jest.fn().mockResolvedValue(undefined),
}));

import { query } from '../../../db/postgres/client';
import { linkRequestToEarlierAsk } from '../../threadBackPointer.service';
import {
  findSharedConversation,
  writeRequestIntoConversation,
} from '../../sharedRequestThread.service';
import { createIncomingRequestThread } from '../../threads.service';
import { requestIntroduction } from '../requestIntroduction';

const mockQuery = query as jest.MockedFunction<typeof query>;
const mockLink = linkRequestToEarlierAsk as jest.MockedFunction<typeof linkRequestToEarlierAsk>;

const MEDIATOR_PHONE = '+12025550142';

function aFreshRequest(): void {
  mockQuery.mockImplementation((sql: string) => {
    const text = String(sql);
    if (text.includes('"UserAlias"'))
      return Promise.resolve({
        rows: [{ phone: MEDIATOR_PHONE, display_name: 'Netai Test 68' }],
        rowCount: 1,
      } as never);
    if (text.includes('FROM "UserPhone"'))
      return Promise.resolve({ rows: [{ userId: 172833 }], rowCount: 1 } as never);
    if (text.includes('FROM threads'))
      return Promise.resolve({ rows: [{ threads: '4' }], rowCount: 1 } as never);
    if (text.includes('INSERT INTO introduction_requests'))
      return Promise.resolve({
        rows: [{ id: 2146, request_ref: 'req_2146' }],
        rowCount: 1,
      } as never);
    if (text.includes('FROM introduction_requests'))
      return Promise.resolve({ rows: [], rowCount: 0 } as never);
    return Promise.resolve({ rows: [{ id: 1, name: 'Netai Test 65' }], rowCount: 1 } as never);
  });
}

async function ask(context: { requesterTaskId?: number }): Promise<{ success?: boolean }> {
  return (await requestIntroduction(
    '172836',
    'Netai Test 68',
    'Nika',
    'could you introduce us?',
    MEDIATOR_PHONE,
    undefined,
    undefined,
    'intro',
    false,
    context,
  )) as { success?: boolean };
}

beforeEach(() => {
  jest.clearAllMocks();
  aFreshRequest();
});

/** Row 305 (a): the request raised from a goal links itself to that goal's ask. */
describe('a request points back to the ask it continues', () => {
  it("links the mediator's new thread to the goal's earlier ask", async () => {
    const result = await ask({ requesterTaskId: 11323 });

    expect(result.success).toBe(true);
    expect(mockLink).toHaveBeenCalledWith(
      expect.objectContaining({
        taskId: 11323,
        requesterUserId: 172836,
        readerUserId: 172833,
        requestThreadId: 27194,
        requestThreadTitle: 'T68 → Nika',
        targetName: 'Nika',
      }),
    );
  });

  it('does not look for an earlier ask when the request has no goal', async () => {
    await ask({});
    expect(mockLink).not.toHaveBeenCalled();
    expect(findSharedConversation).not.toHaveBeenCalled();
  });

  it('opens its own threads when there is no open conversation to continue', async () => {
    await ask({ requesterTaskId: 11323 });

    expect(findSharedConversation).toHaveBeenCalledWith(11323, 172836, 172833);
    expect(createIncomingRequestThread).toHaveBeenCalledTimes(1);
    expect(writeRequestIntoConversation).not.toHaveBeenCalled();
  });

  it('still sends the request when the lines cannot be written', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    mockLink.mockRejectedValueOnce(new Error('timeout'));

    const result = await ask({ requesterTaskId: 11323 });

    expect(result.success).toBe(true);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
