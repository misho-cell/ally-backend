/**
 * Ticket 17 row 6: „it arrives on the desktop, not on the phone."
 *
 * The fault was not the phone's subscription and not Apple's lane. Presence was
 * one boolean per PERSON, and the push was skipped whenever that boolean was
 * true — so with a Mac tab open, every one of Lika's four devices was treated
 * as watching, including the phone in her pocket.
 *
 * The first test here is the reported bug stated as a fact: a stream open on
 * one device, a push that must still reach the other. The rest guard the two
 * ways a per-device rule can go wrong — pushing to the screen someone is
 * reading, and going quiet for a device we cannot name.
 */
import { Response } from 'express';

jest.mock('../../db/postgres/client', () => ({ __esModule: true, query: jest.fn() }));

const sendNotification = jest.fn().mockResolvedValue(undefined);
jest.mock('web-push', () => ({
  __esModule: true,
  default: {
    setVapidDetails: jest.fn(),
    sendNotification: (...args: unknown[]): unknown => sendNotification(...args),
  },
}));

const MAC_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/605.1.15';
const IPHONE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Safari/604.1';
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
}> {
  let sse!: typeof import('../sse.service');
  let push!: typeof import('../notification.service');
  const before = { ...process.env };
  process.env.VAPID_PUBLIC_KEY = 'test-public-key';
  process.env.VAPID_PRIVATE_KEY = 'test-private-key';
  await jest.isolateModulesAsync(async () => {
    sse = await import('../sse.service');
    push = await import('../notification.service');
    const { query } = await import('../../db/postgres/client');
    (query as jest.Mock).mockImplementation((sql: string) => {
      if (sql.includes('FROM push_subscriptions')) {
        return Promise.resolve({
          rows: subscriptions.map((s) => ({ ...s, p256dh: 'p', auth: 'a' })),
        });
      }
      return Promise.resolve({ rows: [] });
    });
  });
  process.env = before;
  return { sse, push };
}

/** The endpoints webpush was actually asked to deliver to. */
function delivered(): string[] {
  return sendNotification.mock.calls.map((c) => (c[0] as { endpoint: string }).endpoint);
}

const PAYLOAD = { title: 'Netai', body: 'answer is ready' };

beforeEach(() => {
  sendNotification.mockClear();
});

describe('push presence is per device (ticket 17 row 6)', () => {
  it('reaches the phone while the desktop is the one that is open', async () => {
    const { sse, push } = await load([
      row('https://apple/mac', MAC_UA),
      row('https://apple/phone', IPHONE_UA),
    ]);

    // She is reading on the Mac. The phone is in her pocket.
    const close = sse.subscribeUserEvents(USER_ID, fakeStream(), sse.deviceKey(null, MAC_UA));
    await push.sendPushNotification(USER_ID, PAYLOAD);
    close();

    expect(delivered()).toEqual(['https://apple/phone']);
  });

  it('does not interrupt the screen the person is actually reading', async () => {
    const { sse, push } = await load([row('https://apple/mac', MAC_UA)]);

    const close = sse.subscribeUserEvents(USER_ID, fakeStream(), sse.deviceKey(null, MAC_UA));
    await push.sendPushNotification(USER_ID, PAYLOAD);
    close();

    expect(delivered()).toEqual([]);
  });

  it('sends to every device once nobody is watching', async () => {
    const { push } = await load([
      row('https://apple/mac', MAC_UA),
      row('https://apple/phone', IPHONE_UA),
    ]);

    await push.sendPushNotification(USER_ID, PAYLOAD);

    expect(delivered().sort()).toEqual(['https://apple/mac', 'https://apple/phone']);
  });

  it('a device it cannot name keeps the old all-or-nothing rule', async () => {
    // Every subscription stored before row 6 is nameless. Treating „unknown" as
    // away would push to the very screen being read, which is the opposite
    // mistake and a worse one.
    const { sse, push } = await load([row('https://apple/nameless', null)]);

    const close = sse.subscribeUserEvents(USER_ID, fakeStream(), sse.deviceKey(null, MAC_UA));
    await push.sendPushNotification(USER_ID, PAYLOAD);
    close();
    expect(delivered()).toEqual([]);

    await push.sendPushNotification(USER_ID, PAYLOAD);
    expect(delivered()).toEqual(['https://apple/nameless']);
  });

  it('an explicit device_id is believed over the user-agent', async () => {
    // A browser update rewrites the user-agent string; the device is the same
    // device. When the frontend names it, that name wins.
    const { sse, push } = await load([
      row('https://apple/phone', 'some older iphone ua', 'device-abc'),
      row('https://apple/mac', MAC_UA, 'device-xyz'),
    ]);

    const close = sse.subscribeUserEvents(
      USER_ID,
      fakeStream(),
      sse.deviceKey('device-abc', 'a newer iphone ua'),
    );
    await push.sendPushNotification(USER_ID, PAYLOAD);
    close();

    expect(delivered()).toEqual(['https://apple/mac']);
  });

  it('two tabs on one device: closing one does not make the device look away', async () => {
    const { sse, push } = await load([row('https://apple/mac', MAC_UA)]);
    const key = sse.deviceKey(null, MAC_UA);

    const closeTabOne = sse.subscribeUserEvents(USER_ID, fakeStream(), key);
    const closeTabTwo = sse.subscribeUserEvents(USER_ID, fakeStream(), key);
    closeTabOne();
    // The second tab is still open — the Mac is still being watched.
    await push.sendPushNotification(USER_ID, PAYLOAD);
    expect(delivered()).toEqual([]);

    closeTabTwo();
    await push.sendPushNotification(USER_ID, PAYLOAD);
    expect(delivered()).toEqual(['https://apple/mac']);
  });

  it('a repeated close does not undercount a device that is still watching', async () => {
    // req.on('close') can fire more than once; a double decrement would let a
    // push interrupt a screen that never went away.
    const { sse, push } = await load([row('https://apple/mac', MAC_UA)]);
    const key = sse.deviceKey(null, MAC_UA);

    const closeA = sse.subscribeUserEvents(USER_ID, fakeStream(), key);
    const closeB = sse.subscribeUserEvents(USER_ID, fakeStream(), key);
    closeA();
    closeA();

    await push.sendPushNotification(USER_ID, PAYLOAD);
    expect(delivered()).toEqual([]);
    closeB();
  });

  it('PUSH_PER_DEVICE=off restores the old behaviour without a deploy', async () => {
    const { sse, push } = await load([
      row('https://apple/mac', MAC_UA),
      row('https://apple/phone', IPHONE_UA),
    ]);

    const close = sse.subscribeUserEvents(USER_ID, fakeStream(), sse.deviceKey(null, MAC_UA));
    // Set around the CALL, not around the load: the switch is read when the
    // push is decided, which is what lets it take effect without a deploy.
    process.env.PUSH_PER_DEVICE = 'off';
    await push.sendPushNotification(USER_ID, PAYLOAD);
    delete process.env.PUSH_PER_DEVICE;
    close();

    expect(delivered()).toEqual([]);
  });

  it('names the same device identically however its user-agent is spaced or cased', async () => {
    const { sse } = await load([]);
    expect(sse.deviceKey(null, '  Mozilla/5.0   (iPhone)  ')).toBe(
      sse.deviceKey(null, 'mozilla/5.0 (iPhone)'),
    );
    expect(sse.deviceKey(null, '   ')).toBeNull();
    expect(sse.deviceKey(null, null)).toBeNull();
  });
});
