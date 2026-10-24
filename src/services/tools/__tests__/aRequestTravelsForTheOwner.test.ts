jest.mock('../../../db/postgres/client', () => ({ __esModule: true, query: jest.fn() }));
jest.mock('../../notification.service', () => ({
  __esModule: true,
  sendPushNotification: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../../threads.service', () => ({
  __esModule: true,
  createIncomingRequestThread: jest.fn().mockResolvedValue({ id: 301, title: 'O → T' }),
  createOutgoingRequestThread: jest.fn().mockResolvedValue({ id: 302, title: 'B → T' }),
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
jest.mock('../../sharedRequestThread.service', () => ({
  __esModule: true,
  findSharedConversation: jest.fn().mockResolvedValue(null),
  writeRequestIntoConversation: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../../askEditor.service', () => ({
  __esModule: true,
  reasonAboutAsker: jest.fn().mockResolvedValue('rewritten'),
}));

import { query } from '../../../db/postgres/client';
import { reasonAboutAsker } from '../../askEditor.service';
import { sendPushNotification } from '../../notification.service';
import { findSharedConversation } from '../../sharedRequestThread.service';
import { createIncomingRequestThread } from '../../threads.service';
import { requestIntroduction } from '../requestIntroduction';

const mockQuery = query as jest.MockedFunction<typeof query>;

const OWNER = '500';
const LINK = '600';
const B_ID = 700;
const B_PHONE = '+995500000007';
const OWNERS_REASON = 'needs an accountant for the company';

function aFreshRequest(): void {
  mockQuery.mockImplementation((sql: string) => {
    const text = String(sql);
    if (text.includes('"UserAlias"'))
      return Promise.resolve({
        rows: [{ phone: B_PHONE, display_name: 'B' }],
        rowCount: 1,
      } as never);
    if (text.includes('FROM "UserPhone"'))
      return Promise.resolve({ rows: [{ userId: B_ID }], rowCount: 1 } as never);
    if (text.includes('FROM threads'))
      return Promise.resolve({ rows: [{ threads: '4' }], rowCount: 1 } as never);
    if (text.includes('INSERT INTO introduction_requests'))
      return Promise.resolve({ rows: [{ id: 9, request_ref: 'req_9' }], rowCount: 1 } as never);
    if (text.includes('FROM introduction_requests'))
      return Promise.resolve({ rows: [], rowCount: 0 } as never);
    if (text.includes('push_subscriptions'))
      return Promise.resolve({ rows: [{ id: 1 }], rowCount: 1 } as never);
    return Promise.resolve({ rows: [{ id: 1, name: 'Owner Name' }], rowCount: 1 } as never);
  });
}

async function passOn(): Promise<{ success?: boolean }> {
  return (await requestIntroduction(
    OWNER,
    'B',
    'Target',
    OWNERS_REASON,
    B_PHONE,
    undefined,
    undefined,
    'intro',
    false,
    { requesterTaskId: 41, forwardedBy: LINK },
  )) as { success?: boolean };
}

beforeEach(() => {
  jest.clearAllMocks();
  aFreshRequest();
});

/** 5347 (tester 61837): „ask B in my name" — B is asked for the OWNER, through the link. */
describe('a request passed on travels for the owner', () => {
  it('stays the owner’s request and records the link who passed it on', async () => {
    const result = await passOn();

    expect(result.success).toBe(true);
    const insert = mockQuery.mock.calls.find((c) =>
      String(c[0]).includes('INSERT INTO introduction_requests'),
    );
    const params = insert?.[1] as unknown[];
    expect(params[0]).toBe(OWNER);
    expect(params[1]).toBe(B_ID);
    expect(params[3]).toBe(OWNERS_REASON);
    expect(params[7]).toBe(41);
    expect(params[params.length - 1]).toBe(Number(LINK));
  });

  it('finds B in the link’s phonebook, not the owner’s', async () => {
    await passOn();

    const lookup = mockQuery.mock.calls.find((c) => String(c[0]).includes('"UserAlias"'));
    expect((lookup?.[1] as unknown[]).map(String)).toContain(LINK);
    expect((lookup?.[1] as unknown[]).map(String)).not.toContain(OWNER);
  });

  it('keeps the owner’s reason as stored, opens new threads and names the link to B', async () => {
    await passOn();

    expect(reasonAboutAsker).not.toHaveBeenCalled();
    expect(findSharedConversation).not.toHaveBeenCalled();
    const call = (createIncomingRequestThread as jest.Mock).mock.calls[0] as unknown[];
    expect(call[call.length - 1]).toBe('Owner Name');
    const push = (sendPushNotification as jest.Mock).mock.calls[0][1] as { body: string };
    // #6634 / D590: first person, never „…-ის სახელით".
    expect(push.body).toContain('დამიკავშირდა');
    expect(push.body).not.toContain('სახელით');
  });

  it('a first-hand request names no one who passed it on', async () => {
    await requestIntroduction(OWNER, 'B', 'Target', 'why', B_PHONE, undefined, undefined, 'intro');

    const call = (createIncomingRequestThread as jest.Mock).mock.calls[0] as unknown[];
    expect(call[call.length - 1]).toBeNull();
    const insert = mockQuery.mock.calls.find((c) =>
      String(c[0]).includes('INSERT INTO introduction_requests'),
    );
    expect((insert?.[1] as unknown[]).at(-1)).toBeNull();
  });

  it('refuses to pass it back to the link themself', async () => {
    mockQuery.mockImplementation((sql: string) => {
      const text = String(sql);
      if (text.includes('"UserAlias"'))
        return Promise.resolve({
          rows: [{ phone: B_PHONE, display_name: 'A' }],
          rowCount: 1,
        } as never);
      if (text.includes('FROM "UserPhone"'))
        return Promise.resolve({ rows: [{ userId: Number(LINK) }], rowCount: 1 } as never);
      return Promise.resolve({ rows: [], rowCount: 0 } as never);
    });

    const result = await passOn();

    expect(result.success).toBe(false);
  });
});
