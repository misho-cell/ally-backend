jest.mock('../../db/postgres/client', () => ({ __esModule: true, query: jest.fn() }));
jest.mock('../heldPushes.service', () => ({
  __esModule: true,
  holdPush: jest.fn().mockResolvedValue(undefined),
  duePushes: jest.fn().mockResolvedValue([]),
  releaseHeld: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../sse.service', () => ({
  __esModule: true,
  connectedDevices: jest.fn(() => new Set<string>()),
  deviceKey: jest.fn(() => 'some-device'),
  hasActiveConnection: jest.fn(() => false),
}));
const sendNotification = jest.fn().mockResolvedValue({ statusCode: 201, body: '', headers: {} });
jest.mock('web-push', () => ({
  __esModule: true,
  default: {
    setVapidDetails: jest.fn(),
    sendNotification: (...args: unknown[]): unknown => sendNotification(...args),
  },
}));

import { query } from '../../db/postgres/client';
import { duePushes, holdPush, releaseHeld } from '../heldPushes.service';
import { connectedDevices } from '../sse.service';

const mockQuery = query as jest.MockedFunction<typeof query>;
const mockHold = holdPush as jest.MockedFunction<typeof holdPush>;
const mockDue = duePushes as jest.MockedFunction<typeof duePushes>;
const mockRelease = releaseHeld as jest.MockedFunction<typeof releaseHeld>;
const mockLive = connectedDevices as jest.MockedFunction<typeof connectedDevices>;

const USER = '171871';
const PAYLOAD = { title: 'Netai', body: 'პასუხი მზადაა', url: '/chat/1' };
const PHONE = {
  endpoint: 'https://web.push.apple.com/phone',
  p256dh: 'k',
  auth: 'a',
  user_agent: 'iPhone',
  device_id: 'phone',
  time_zone: null as string | null,
};
const NEW_YORK_PHONE = {
  ...PHONE,
  endpoint: 'https://fcm.googleapis.com/ny',
  time_zone: 'America/New_York',
};

function rows(list: readonly unknown[]): never {
  return { rows: list, rowCount: list.length } as never;
}

/** The sender reads its VAPID keys at load, so they are set before it is loaded. */
function loadSender(): typeof import('../notification.service') {
  process.env.VAPID_PUBLIC_KEY = 'pub';
  process.env.VAPID_PRIVATE_KEY = 'priv';
  let mod!: typeof import('../notification.service');
  jest.isolateModules(() => {
    mod = jest.requireActual('../notification.service');
  });
  return mod;
}

/** Only Date is faked: each test names its own instant. */
function at(iso: string): void {
  jest.useFakeTimers({
    now: new Date(iso),
    doNotFake: ['setTimeout', 'setInterval', 'setImmediate', 'nextTick', 'queueMicrotask'],
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockLive.mockReturnValue(new Set<string>());
  mockQuery.mockImplementation((async (sql: string) =>
    String(sql).includes('FROM push_subscriptions') ? rows([PHONE]) : rows([])) as never);
});
afterEach(() => jest.useRealTimers());

/**
 * Giorgi's decision, 2 October (G-002): no push between 23:00 and 09:30 on the
 * recipient's clock; held, then sent at 09:30. The message in the app is not
 * this code's concern and is untouched.
 */
describe('a push in quiet hours', () => {
  it('at 23:30 Tbilisi is held for 09:30 and not sent', async () => {
    at('2026-10-02T19:30:00Z');
    await loadSender().sendPushNotification(USER, PAYLOAD);

    expect(sendNotification).not.toHaveBeenCalled();
    expect(mockHold).toHaveBeenCalledWith(
      USER,
      PHONE.endpoint,
      PAYLOAD,
      new Date('2026-10-03T05:30:00Z'),
    );
  });

  it('at 22:50 Tbilisi goes at once', async () => {
    at('2026-10-02T18:50:00Z');
    await loadSender().sendPushNotification(USER, PAYLOAD);

    expect(sendNotification).toHaveBeenCalledTimes(1);
    expect(mockHold).not.toHaveBeenCalled();
  });

  it('is read on each device’s own clock', async () => {
    // 20:00 UTC: midnight in Tbilisi, 16:00 in New York.
    at('2026-10-02T20:00:00Z');
    mockQuery.mockImplementation((async (sql: string) =>
      String(sql).includes('FROM push_subscriptions')
        ? rows([PHONE, NEW_YORK_PHONE])
        : rows([])) as never);
    await loadSender().sendPushNotification(USER, PAYLOAD);

    expect(mockHold).toHaveBeenCalledTimes(1);
    expect(mockHold.mock.calls[0][1]).toBe(PHONE.endpoint);
    expect(sendNotification).toHaveBeenCalledTimes(1);
    expect(sendNotification.mock.calls[0][0]).toEqual(
      expect.objectContaining({ endpoint: NEW_YORK_PHONE.endpoint }),
    );
  });

  it('is sent now rather than lost when the hold cannot be written', async () => {
    at('2026-10-02T19:30:00Z');
    const logged = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    mockHold.mockRejectedValueOnce(new Error('db down'));
    await loadSender().sendPushNotification(USER, PAYLOAD);

    expect(sendNotification).toHaveBeenCalledTimes(1);
    logged.mockRestore();
  });
});

describe('the morning release', () => {
  const HELD = { id: 7, userId: USER, endpoint: PHONE.endpoint, payload: PAYLOAD };

  it('sends what was held and forgets it', async () => {
    at('2026-10-03T05:31:00Z');
    mockDue.mockResolvedValueOnce([HELD]);

    expect(await loadSender().releaseHeldPushes()).toBe(1);

    expect(sendNotification).toHaveBeenCalledTimes(1);
    expect(mockRelease).toHaveBeenCalledWith(7);
  });

  it('forgets a held push whose device is gone, without sending', async () => {
    at('2026-10-03T05:31:00Z');
    mockDue.mockResolvedValueOnce([HELD]);
    mockQuery.mockResolvedValue(rows([]));

    expect(await loadSender().releaseHeldPushes()).toBe(0);

    expect(sendNotification).not.toHaveBeenCalled();
    expect(mockRelease).toHaveBeenCalledWith(7);
  });

  it('skips a device its owner is looking at — the message is already in the app', async () => {
    at('2026-10-03T05:31:00Z');
    mockDue.mockResolvedValueOnce([HELD]);
    mockLive.mockReturnValue(new Set(['some-device']));

    expect(await loadSender().releaseHeldPushes()).toBe(0);

    expect(sendNotification).not.toHaveBeenCalled();
    expect(mockRelease).toHaveBeenCalledWith(7);
  });
});
