const createSession = jest.fn();
jest.mock('../stripe.service', () => ({
  __esModule: true,
  ensureCustomer: jest.fn().mockResolvedValue('cus_1'),
  stripeClient: () => ({ checkout: { sessions: { create: createSession } } }),
}));
jest.mock('../tokenWallet.service', () => ({
  __esModule: true,
  findTopupPackageById: jest.fn(),
  creditTopup: jest.fn(),
}));
jest.mock('../payments.service', () => ({
  __esModule: true,
  recordPayment: jest.fn().mockResolvedValue(true),
}));
jest.mock('../notification.service', () => ({
  __esModule: true,
  sendPushNotification: jest.fn().mockResolvedValue(undefined),
}));

import Stripe from 'stripe';
import { creditTopup, findTopupPackageById } from '../tokenWallet.service';
import { recordPayment } from '../payments.service';
import { sendPushNotification } from '../notification.service';
import {
  createTopupCheckout,
  deliverTopupSession,
  isTopupSession,
  TopupRefusal,
} from '../stripeTopup.service';

const mockFind = findTopupPackageById as jest.MockedFunction<typeof findTopupPackageById>;
const mockCredit = creditTopup as jest.MockedFunction<typeof creditTopup>;
const mockRecord = recordPayment as jest.MockedFunction<typeof recordPayment>;
const mockPush = sendPushNotification as jest.MockedFunction<typeof sendPushNotification>;

const PACK = {
  id: 2,
  paddlePriceId: 'pri_x',
  tokens: 1000,
  label: '1,000 ტოკენი — $19.99',
  priceUsd: 19.99,
};

function session(over: Partial<Stripe.Checkout.Session> = {}): Stripe.Checkout.Session {
  return {
    id: 'cs_1',
    mode: 'payment',
    payment_status: 'paid',
    metadata: { kind: 'topup', user_id: '165699', package_id: '2' },
    client_reference_id: '165699',
    amount_total: 1999,
    currency: 'usd',
    created: 1_759_400_000,
    ...over,
  } as Stripe.Checkout.Session;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockFind.mockResolvedValue(PACK);
  mockCredit.mockResolvedValue(true);
  createSession.mockResolvedValue({ url: 'https://checkout.stripe.com/c/1' });
});

/**
 * Row 292: the pack button opened Paddle, which said „Something went wrong";
 * no pack was ever bought. Misho, 2 October: packs go through Stripe.
 */
describe('opening a pack checkout', () => {
  it('charges the pack’s own price from our table, once, in cents', async () => {
    expect(await createTopupCheckout('165699', 2)).toEqual({
      ok: true,
      url: 'https://checkout.stripe.com/c/1',
    });
    const args = createSession.mock.calls[0][0];
    expect(args.mode).toBe('payment');
    expect(args.line_items[0].price_data).toEqual({
      currency: 'usd',
      unit_amount: 1999,
      product_data: { name: PACK.label },
    });
    expect(args.metadata).toEqual({ kind: 'topup', user_id: '165699', package_id: '2' });
  });

  it('refuses a package that does not exist or has no price', async () => {
    mockFind.mockResolvedValueOnce(null);
    expect(await createTopupCheckout('165699', 9)).toEqual({
      ok: false,
      refusal: TopupRefusal.UnknownPackage,
    });
    mockFind.mockResolvedValueOnce({ ...PACK, priceUsd: null });
    expect(await createTopupCheckout('165699', 2)).toEqual({
      ok: false,
      refusal: TopupRefusal.UnknownPackage,
    });
    expect(createSession).not.toHaveBeenCalled();
  });
});

describe('delivering a paid pack', () => {
  it('credits the tokens once, by the session id, records the payment and says so', async () => {
    expect(await deliverTopupSession(session())).toBe(true);

    expect(mockCredit).toHaveBeenCalledWith('165699', 1000, 'cs_1');
    expect(mockRecord).toHaveBeenCalledWith(
      expect.objectContaining({ externalId: 'cs_1', kind: 'topup', amountMinor: 1999 }),
    );
    expect(mockPush).toHaveBeenCalledTimes(1);
  });

  it('adds nothing on a retried webhook', async () => {
    mockCredit.mockResolvedValueOnce(false);
    expect(await deliverTopupSession(session())).toBe(false);
    expect(mockRecord).not.toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('credits nothing for a session that is not paid', async () => {
    expect(await deliverTopupSession(session({ payment_status: 'unpaid' }))).toBe(false);
    expect(mockCredit).not.toHaveBeenCalled();
  });

  it('leaves a subscription checkout to the subscription path', () => {
    expect(isTopupSession(session({ mode: 'subscription' }))).toBe(false);
    expect(isTopupSession(session({ metadata: {} }))).toBe(false);
  });

  it('credits nothing and says why when the package is unknown', async () => {
    const logged = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    mockFind.mockResolvedValueOnce(null);
    expect(await deliverTopupSession(session())).toBe(false);
    expect(mockCredit).not.toHaveBeenCalled();
    expect(logged).toHaveBeenCalled();
    logged.mockRestore();
  });
});
