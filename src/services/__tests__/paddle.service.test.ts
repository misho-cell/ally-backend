/**
 * Which Paddle events are still acted on.
 *
 * Subscriptions moved to Stripe on 2 Sep and the whole webhook was switched
 * off with them — but token top-ups never moved, and the buy button never came
 * down. A subscriber could pay for a thousand tokens and be credited nothing.
 * These tests are about that split and nothing else.
 */
import { EventName } from '@paddle/paddle-node-sdk';

const unmarshal = jest.fn();

jest.mock('../../config/paddle', () => ({
  __esModule: true,
  default: { webhooks: { unmarshal: (...args: unknown[]) => unmarshal(...args) } },
}));
jest.mock('../../db/postgres/client', () => ({ __esModule: true, query: jest.fn() }));
jest.mock('../notification.service', () => ({
  __esModule: true,
  sendPushNotification: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../referral.service', () => ({
  __esModule: true,
  distributeReferralEarnings: jest.fn().mockResolvedValue(undefined),
}));

const creditTopup = jest.fn().mockResolvedValue(true);
const findTopupPackageByPriceId = jest.fn();
jest.mock('../tokenWallet.service', () => ({
  __esModule: true,
  creditTopup: (...a: unknown[]) => creditTopup(...a),
  findTopupPackageByPriceId: (...a: unknown[]) => findTopupPackageByPriceId(...a),
}));

/** Load the service fresh, because both flags are read at module load. */
async function loadService(env: Record<string, string | undefined>) {
  let mod!: typeof import('../paddle.service');
  const before = { ...process.env };
  // Assigning undefined would set the STRING "undefined" — process.env coerces
  // every value. An unset variable has to be deleted.
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  await jest.isolateModulesAsync(async () => {
    mod = await import('../paddle.service');
  });
  process.env = before;
  return mod;
}

function topupEvent() {
  return {
    eventType: EventName.TransactionCompleted,
    data: {
      id: 'txn_1',
      subscriptionId: null,
      items: [{ price: { id: 'pri_topup' } }],
      customData: { user_id: '7' },
    },
  };
}

function subscriptionRenewalEvent() {
  return {
    eventType: EventName.TransactionCompleted,
    data: {
      id: 'txn_2',
      subscriptionId: 'sub_1',
      items: [],
      details: { totals: { total: '1999' } },
    },
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  creditTopup.mockResolvedValue(true);
  findTopupPackageByPriceId.mockResolvedValue({ id: 1, tokens: 1000, priceUsd: 19.99 });
});

describe('with Paddle subscriptions switched off', () => {
  it('still credits a top-up somebody paid for', async () => {
    unmarshal.mockResolvedValue(topupEvent());
    const svc = await loadService({ PADDLE_ENABLED: 'false', PADDLE_TOPUP_ENABLED: undefined });

    await svc.processWebhookEvent('{}', 'sig');

    expect(creditTopup).toHaveBeenCalledWith('7', 1000, 'txn_1');
  });

  it('ignores a subscription renewal — Stripe owns those now', async () => {
    unmarshal.mockResolvedValue(subscriptionRenewalEvent());
    const svc = await loadService({ PADDLE_ENABLED: 'false' });

    await svc.processWebhookEvent('{}', 'sig');

    expect(creditTopup).not.toHaveBeenCalled();
  });

  it('ignores subscription lifecycle events too', async () => {
    unmarshal.mockResolvedValue({
      eventType: EventName.SubscriptionCanceled,
      data: { id: 'sub_1' },
    });
    const svc = await loadService({ PADDLE_ENABLED: 'false' });

    await expect(svc.processWebhookEvent('{}', 'sig')).resolves.toBeUndefined();
  });
});

describe('the emergency switch', () => {
  it('PADDLE_TOPUP_ENABLED=false stops crediting', async () => {
    unmarshal.mockResolvedValue(topupEvent());
    const svc = await loadService({ PADDLE_ENABLED: 'false', PADDLE_TOPUP_ENABLED: 'false' });

    await svc.processWebhookEvent('{}', 'sig');

    expect(creditTopup).not.toHaveBeenCalled();
  });
});

describe('the signature', () => {
  // It used to be possible to reach a 200 without ever checking this, because
  // the route dropped every event before the service saw it.
  it('is checked before anything else, whatever the flags say', async () => {
    unmarshal.mockResolvedValue(null);
    const svc = await loadService({ PADDLE_ENABLED: 'false' });

    await expect(svc.processWebhookEvent('{}', 'bad')).rejects.toThrow(
      'Invalid Paddle webhook signature',
    );
    expect(creditTopup).not.toHaveBeenCalled();
  });

  // A header the SDK cannot even parse THROWS rather than returning null. Left
  // as its own error it reached the route as a 500, and Paddle retries a 500 —
  // so a forged header came back on a schedule until it gave up.
  it('a header the SDK cannot parse is a rejection, not a server fault', async () => {
    unmarshal.mockRejectedValue(new Error('Invalid signature header format'));
    const svc = await loadService({ PADDLE_ENABLED: 'false' });

    await expect(svc.processWebhookEvent('{}', 'garbage')).rejects.toThrow(
      'Invalid Paddle webhook signature',
    );
  });
});
