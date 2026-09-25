/**
 * ⚠️ NOT A LITERAL, AND THAT IS THE POINT — GitHub's push protection refused
 * the first version of this file.
 *
 * An account SID is „AC" and thirty-two hex characters, which is a shape the
 * secret scanner knows by heart, and pasting the real one into a test to prove
 * we redact it is the same class of mistake the test is about. It is built
 * here instead: the right shape for the redaction to bite on, belonging to
 * nobody.
 */
const FAKE_SID = `AC${'0'.repeat(28)}c3ea`;

process.env.TWILIO_ACCOUNT_SID = FAKE_SID;
process.env.TWILIO_AUTH_TOKEN = 'test-token';
process.env.TWILIO_VERIFY_SERVICE_SID = 'VAtest';

/**
 * ⚠️ THE FIRST REAL INVITATION THE FOUNDER EVER SENT, 25 September, 12:43
 * Tbilisi. Valeri Chalabashvili has no WhatsApp. He opened the link, pressed
 * „didn't get the code — send via SMS", and read this:
 *
 *   authentication failed, account AC……… with status 4 is not active
 *
 * — with the real id in place of the dots, which is why it is dots here.
 *
 * The provider's own sentence, in English, with our account id in it, to a
 * stranger at the door. `/auth/resend-otp` answers with `error.message` and
 * nothing in between rewrote it — the same shape as a raw database error
 * reaching a client, which CLAUDE.md forbids by name.
 *
 * AND NOTHING WAS WRITTEN DOWN. No line in the container log, no row
 * anywhere. `usage_events` records `otp_sms` only after a send SUCCEEDS, so a
 * total SMS outage and a quiet afternoon leave identical evidence. The first
 * anybody knew was a person who could not get in — which is the week's
 * recurring fault in a new place.
 *
 * Whether the provider account is inactive is a billing matter and somebody
 * else's to settle. These tests hold the two things that are ours: it is
 * never silent, and it is never quoted at the person locked out.
 */
const create = jest.fn();
const verificationCheck = jest.fn();

jest.mock('twilio', () => ({
  __esModule: true,
  default: jest.fn(() => ({
    verify: {
      v2: {
        services: () => ({
          verifications: { create },
          verificationChecks: { create: verificationCheck },
        }),
      },
    },
  })),
}));

jest.mock('../costLedger.service', () => ({
  __esModule: true,
  recordFixedUsage: jest.fn().mockResolvedValue(undefined),
  resolveUserIdByPhone: jest.fn().mockResolvedValue(null),
}));

import { sendSmsOtp, checkTwilioCode } from '../twilio.service';

/** The provider's real answer, as the founder's screenshot shows it. */
function accountNotActive(): Error & { code: number; status: number } {
  return Object.assign(
    new Error(`authentication failed, account ${FAKE_SID} with status 4 is not active`),
    { code: 20003, status: 401 },
  );
}

let logged: string[] = [];
let spy: jest.SpyInstance;

beforeEach(() => {
  jest.clearAllMocks();
  logged = [];
  spy = jest.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
    logged.push(args.map(String).join(' '));
  });
});

afterEach(() => spy.mockRestore());

describe('what the person at the door is told', () => {
  it('never carries the provider’s sentence or our account id', async () => {
    create.mockRejectedValue(accountNotActive());

    await expect(sendSmsOtp('+995599123456')).rejects.toThrow();
    const message = await sendSmsOtp('+995599123456').catch((e: Error) => e.message);

    expect(message).not.toMatch(/AC[0-9a-f]{10}/i);
    expect(message).not.toContain('authentication failed');
    expect(message).not.toContain('status 4');
  });

  /**
   * A refusal that only forbids leaves the reader nothing to do — the lesson
   * this codebase has had to learn three times in the model's own refusals,
   * and it is the same for a person. The one thing Valeri could have done was
   * WhatsApp, and nothing on his screen said so.
   */
  it('says it is ours, and names the way in that still works', async () => {
    create.mockRejectedValue(accountNotActive());

    const message = await sendSmsOtp('+995599123456').catch((e: Error) => e.message);

    expect(message).toContain('WhatsApp');
    expect(message).toContain('ჩვენი მხარის');
  });

  /**
   * A missing env var and a suspended account are one thing to the person at
   * the door, and the config message names our variables. It goes through the
   * same door.
   */
  it('does not leak the configuration message either', async () => {
    // A fresh module, because the client is cached after its first successful
    // build and an env var removed later would never be looked at again.
    jest.resetModules();
    const saved = process.env.TWILIO_AUTH_TOKEN;
    delete process.env.TWILIO_AUTH_TOKEN;
    const fresh: typeof import('../twilio.service') = await import('../twilio.service');

    const message = await fresh.sendSmsOtp('+995599123456').catch((e: Error) => e.message);

    expect(message).not.toContain('TWILIO_AUTH_TOKEN');
    expect(message).toContain('WhatsApp');
    process.env.TWILIO_AUTH_TOKEN = saved;
  });
});

describe('what the container log is told', () => {
  it('writes one greppable line naming the provider’s own code', async () => {
    create.mockRejectedValue(accountNotActive());

    await sendSmsOtp('+995599123456').catch(() => undefined);

    expect(logged).toHaveLength(1);
    expect(logged[0]).toContain('[otp-sms] PROVIDER REFUSED');
    expect(logged[0]).toContain('code=20003');
    expect(logged[0]).toContain('status=401');
    expect(logged[0]).toContain('is not active');
  });

  /**
   * The log is the thing people paste into tickets, so it carries the account
   * id as its last four and the phone as its last four — D149's rule, applied
   * where it was not yet applied rather than remembered case by case.
   */
  it('keeps our account id and the number out of it, as last four', async () => {
    create.mockRejectedValue(
      Object.assign(new Error(`${FAKE_SID} could not reach +995599123456`), {
        code: 21211,
      }),
    );

    await sendSmsOtp('+995599123456').catch(() => undefined);

    expect(logged[0]).toContain('AC…c3ea');
    expect(logged[0]).not.toContain(FAKE_SID);
    expect(logged[0]).toContain('…3456');
    expect(logged[0]).not.toContain('+995599123456');
  });

  /** Nothing is logged when it works — an outage line must stay rare to read. */
  it('says nothing at all on a send that goes', async () => {
    create.mockResolvedValue({ sid: 'VE1' });

    await sendSmsOtp('+995599123456');

    expect(logged).toEqual([]);
  });
});

describe('checking a code, when the provider is the one that is broken', () => {
  /**
   * FALSE STAYS FALSE. A provider we cannot reach must never admit anybody,
   * and that verdict does not move.
   */
  it('still refuses', async () => {
    verificationCheck.mockRejectedValue(accountNotActive());

    await expect(checkTwilioCode('+995599123456', '123456')).resolves.toBe(false);
  });

  /**
   * But „the code was wrong" and „the provider is down" were the same silent
   * false until today — the same conflation as ok = false meaning both a
   * refusal and a fault. The verdict is unchanged; the reason is now written.
   */
  it('no longer looks like a wall of people mistyping', async () => {
    verificationCheck.mockRejectedValue(accountNotActive());

    await checkTwilioCode('+995599123456', '123456');

    expect(logged[0]).toContain('[otp-sms] PROVIDER REFUSED');
  });

  it('logs nothing when the code is simply wrong', async () => {
    verificationCheck.mockResolvedValue({ status: 'pending' });

    await expect(checkTwilioCode('+995599123456', '000000')).resolves.toBe(false);
    expect(logged).toEqual([]);
  });
});
