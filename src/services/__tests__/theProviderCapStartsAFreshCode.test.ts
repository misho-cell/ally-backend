const create = jest.fn();
const update = jest.fn();
const verifications = Object.assign(
  jest.fn(() => ({ update })),
  { create },
);

jest.mock('twilio', () => ({
  __esModule: true,
  default: jest.fn(() => ({
    verify: {
      v2: { services: () => ({ verifications, verificationChecks: { create: jest.fn() } }) },
    },
  })),
}));

jest.mock('../costLedger.service', () => ({
  __esModule: true,
  recordFixedUsage: jest.fn().mockResolvedValue(undefined),
  resolveUserIdByPhone: jest.fn().mockResolvedValue(null),
}));

import { sendSmsOtp } from '../twilio.service';

const PHONE = '+995500000001';

function providerError(code: number, status: number): Error & { code: number; status: number } {
  return Object.assign(new Error('provider said no'), { code, status });
}

beforeAll(() => {
  process.env.TWILIO_ACCOUNT_SID = 'AC00000000000000000000000000000000';
  process.env.TWILIO_AUTH_TOKEN = 'test-token';
  process.env.TWILIO_VERIFY_SERVICE_SID = 'VA00000000000000000000000000000000';
});

beforeEach(() => {
  create.mockReset();
  update.mockReset();
  verifications.mockClear();
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});

/** #6338 (Ninia, 20 Oct): Twilio Verify's 5-send cap on one verification (60203). */
describe('the provider’s cap on one verification', () => {
  it('cancels the pending verification and sends a fresh code, once', async () => {
    create.mockRejectedValueOnce(providerError(60203, 429)).mockResolvedValueOnce({});
    update.mockResolvedValueOnce({});

    await expect(sendSmsOtp(PHONE)).resolves.toBeUndefined();

    expect(verifications).toHaveBeenCalledWith(PHONE);
    expect(update).toHaveBeenCalledWith({ status: 'canceled' });
    expect(create).toHaveBeenCalledTimes(2);
  });

  it('still fails plainly when the fresh one is refused too', async () => {
    create.mockRejectedValue(providerError(60203, 429));
    update.mockResolvedValue({});
    await expect(sendSmsOtp(PHONE)).rejects.toThrow();
    expect(create).toHaveBeenCalledTimes(2);
  });

  it('does not retry any other refusal', async () => {
    create.mockRejectedValueOnce(providerError(20003, 401));
    await expect(sendSmsOtp(PHONE)).rejects.toThrow();
    expect(update).not.toHaveBeenCalled();
    expect(create).toHaveBeenCalledTimes(1);
  });
});
