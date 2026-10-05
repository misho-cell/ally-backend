/**
 * #1321 (Giorgi, urgent): he chats on his laptop and reads the reply live, and
 * his phone rings for the same reply. A reply to the owner's own message is
 * not pushed anywhere while the device they asked from still has its stream
 * open; once that tab is closed, the next reply reaches the phone.
 */
import { Response } from 'express';

jest.mock('../../db/postgres/client', () => ({ __esModule: true, query: jest.fn() }));

const sendNotification = jest.fn().mockResolvedValue({ statusCode: 201, body: '', headers: {} });
jest.mock('web-push', () => ({
  __esModule: true,
  default: {
    setVapidDetails: jest.fn(),
    sendNotification: (...args: unknown[]): unknown => sendNotification(...args),
  },
}));

/**
 * Push quiet hours (G-002) hold every push between 23:00 and 09:30 device time,
 * so these tests read a clock pinned to Tbilisi noon — deterministic whenever
 * they run. Only Date is faked; timers and promises stay real.
 */
const TBILISI_NOON = new Date('2026-10-02T08:00:00Z');
beforeAll(() => {
  jest.useFakeTimers({
    now: TBILISI_NOON,
    doNotFake: ['setTimeout', 'setInterval', 'setImmediate', 'nextTick', 'queueMicrotask'],
  });
});
afterAll(() => jest.useRealTimers());

const USER_ID = '167250';

interface Sub {
  endpoint: string;
  user_agent: string | null;
  device_id: string | null;
}

function row(endpoint: string, userAgent: string | null, deviceId: string | null = null): Sub {
  return { endpoint, user_agent: userAgent, device_id: deviceId };
}

/** A stub stream: subscribeUserEvents only sets headers and writes. */
function fakeStream(): Response {
  return {
    setHeader: () => undefined,
    flushHeaders: () => undefined,
    write: () => true,
  } as unknown as Response;
}

/**
 * Both modules from ONE fresh load. They have to be the same instances: the
 * presence registry the stream writes to is the one the push service reads, and
 * loading them separately would quietly test nothing.
 */
async function load(subscriptions: Sub[]): Promise<{
  sse: typeof import('../sse.service');
  push: typeof import('../notification.service');
  db: jest.Mock;
}> {
  let sse!: typeof import('../sse.service');
  let push!: typeof import('../notification.service');
  let db!: jest.Mock;
  const before = { ...process.env };
  process.env.VAPID_PUBLIC_KEY = 'test-public-key';
  process.env.VAPID_PRIVATE_KEY = 'test-private-key';
  await jest.isolateModulesAsync(async () => {
    sse = await import('../sse.service');
    push = await import('../notification.service');
    // Taken from INSIDE the isolate and handed back: importing the client out
    // here returns a different module instance, whose mock records nothing
    // these modules did.
    db = (await import('../../db/postgres/client')).query as unknown as jest.Mock;
    db.mockImplementation((sql: string) => {
      if (sql.includes('FROM push_subscriptions')) {
        return Promise.resolve({
          rows: subscriptions.map((s) => ({ ...s, p256dh: 'p', auth: 'a' })),
        });
      }
      return Promise.resolve({ rows: [] });
    });
  });
  process.env = before;
  return { sse, push, db };
}

/** The endpoints webpush was actually asked to deliver to. */
function delivered(): string[] {
  return sendNotification.mock.calls.map((c) => (c[0] as { endpoint: string }).endpoint);
}

const PAYLOAD = { title: 'Netai', body: 'answer is ready' };

beforeEach(() => {
  sendNotification.mockClear();
});

const LAPTOP = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/129.0';
const PHONE = 'Mozilla/5.0 (Linux; Android 14) Chrome/129.0 Mobile';

describe('no phone push while the owner reads the reply where they asked', () => {
  it('rings no device while the asking laptop is still connected', async () => {
    const { sse, push } = await load([
      row('https://fcm/phone', PHONE),
      row('https://fcm/laptop', LAPTOP),
    ]);
    const laptop = sse.deviceKey(null, LAPTOP);
    const close = sse.subscribeUserEvents(USER_ID, fakeStream(), laptop);
    await push.sendPushNotification(USER_ID, PAYLOAD, { askedFrom: laptop });
    close();
    expect(delivered()).toEqual([]);
  });

  it('rings the phone once the laptop tab is closed', async () => {
    const { push, sse } = await load([row('https://fcm/phone', PHONE)]);
    await push.sendPushNotification(USER_ID, PAYLOAD, { askedFrom: sse.deviceKey(null, LAPTOP) });
    expect(delivered()).toEqual(['https://fcm/phone']);
  });

  it('keeps the old per-device rule for a push that names no asking device', async () => {
    const { sse, push } = await load([
      row('https://fcm/phone', PHONE),
      row('https://fcm/laptop', LAPTOP),
    ]);
    const close = sse.subscribeUserEvents(USER_ID, fakeStream(), sse.deviceKey(null, LAPTOP));
    await push.sendPushNotification(USER_ID, PAYLOAD);
    close();
    expect(delivered()).toEqual(['https://fcm/phone']);
  });

  it('decides on the asking device alone', async () => {
    const { push } = await load([]);
    expect(push.askerIsReading('laptop', new Set(['laptop']))).toBe(true);
    expect(push.askerIsReading('laptop', new Set(['phone']))).toBe(false);
    expect(push.askerIsReading(null, new Set(['laptop']))).toBe(false);
  });
});
