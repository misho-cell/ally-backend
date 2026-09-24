const dbQuery = jest.fn();
jest.mock('../../db/postgres/client', () => ({
  __esModule: true,
  query: (...args: unknown[]) => dbQuery(...args),
}));
jest.mock('../contacts.service', () => ({ __esModule: true }));

const checkRegistrationEligibility = jest.fn();
jest.mock('../inviteGate.service', () => ({
  __esModule: true,
  checkRegistrationEligibility: (...args: unknown[]) => checkRegistrationEligibility(...args),
}));

const grantWhateverFreePeriodIsOwed = jest.fn();
jest.mock('../auth.service', () => ({
  __esModule: true,
  grantWhateverFreePeriodIsOwed: (...args: unknown[]) => grantWhateverFreePeriodIsOwed(...args),
}));

import { createTestSeat, SeatCreationRefused } from '../testSeatCreate.service';

/**
 * A FICTIONAL SEAT THAT ARRIVED THROUGH AN INVITATION — because otherwise the
 * free days cannot be tested at all.
 *
 * The tester, 24 September, on why their round was blocked: „our only way to
 * make a fictional account is POST /admin/test-accounts. It writes the account
 * directly; it does not go through registration and takes no inviter. So from
 * our side there is no invited fictional registration to make — the grant path
 * cannot be reached."
 *
 * They were right, and the feature they could not reach is one that SPENDS
 * MONEY on every invited joiner (D485, switched on at 16:07 UTC). A grant that
 * cannot be observed is a grant nobody can say works.
 *
 * ⚠️ WHAT MAKES THIS A TEST AND NOT A THEATRE. The rules are not re-implemented
 * here: the inviter is resolved by the product's own
 * `checkRegistrationEligibility`, and the period by the same
 * `grantWhateverFreePeriodIsOwed` that `registerUser` calls. These tests assert
 * that those two are CALLED, with what a real registration would pass them — a
 * copy of the rules would agree with itself and prove nothing.
 *
 * The OTP is the only thing skipped, and only the OTP. It proves possession of
 * a phone, and a fictional number has nobody to prove it.
 */
const INVITER_SEAT = '171871';
const INVITER_PHONE = '+12025550111';

interface World {
  /** Absent = the id given as the inviter is not a seat. */
  inviterPhone?: string;
}

function world(w: World = { inviterPhone: INVITER_PHONE }): void {
  dbQuery.mockImplementation((sql: string) => {
    const text = String(sql);
    if (text.includes('RETURNING id'))
      return Promise.resolve({ rows: [{ id: 900002 }], rowCount: 1 });
    if (text.includes('FROM test_seats ts'))
      return Promise.resolve(
        w.inviterPhone === undefined
          ? { rows: [], rowCount: 0 }
          : { rows: [{ phone: w.inviterPhone }], rowCount: 1 },
      );
    return Promise.resolve({ rows: [], rowCount: 0 });
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  world();
  checkRegistrationEligibility.mockResolvedValue({
    eligible: true,
    mode: 'referral',
    inviterUserId: Number(INVITER_SEAT),
  });
  grantWhateverFreePeriodIsOwed.mockResolvedValue(undefined);
});

function make(invitedBy?: string): Promise<unknown> {
  return createTestSeat('Netai Test 99', [], 0, 'admin:1', 'proving the free days', {
    invitedBy,
  });
}

describe('an ordinary seat is untouched', () => {
  /**
   * The default has to stay exactly what it was. Eleven seats and every test
   * above depend on a seat being created without any of this running.
   */
  it('asks the gate nothing and grants nothing when no inviter is named', async () => {
    await make(undefined);

    expect(checkRegistrationEligibility).not.toHaveBeenCalled();
    expect(grantWhateverFreePeriodIsOwed).not.toHaveBeenCalled();
  });
});

describe('a seat that arrived by invitation', () => {
  it("asks the product's own gate, with the inviter's phone", async () => {
    await make(INVITER_SEAT);

    expect(checkRegistrationEligibility).toHaveBeenCalledWith(
      expect.stringContaining('+1202555'),
      INVITER_PHONE,
    );
  });

  /**
   * The same function `registerUser` calls, with the gate's answer passed
   * through untouched. Deciding here what the period should be — even
   * „obviously 20" — would be the copy this file exists to avoid.
   */
  it("hands the gate's answer to the real grant", async () => {
    await make(INVITER_SEAT);

    expect(grantWhateverFreePeriodIsOwed).toHaveBeenCalledWith(
      900002,
      expect.stringContaining('+1202555'),
      expect.objectContaining({ mode: 'referral', inviterUserId: Number(INVITER_SEAT) }),
    );
  });

  /** Without it the account carries free days and nothing says where from. */
  it('records the inviter on the account, as registration does', async () => {
    await make(INVITER_SEAT);

    const link = dbQuery.mock.calls.find((c) =>
      String(c[0]).includes('"inviterReferralUserId" = $2'),
    );

    expect(link).toBeDefined();
    expect(link?.[1]).toEqual(['900002', Number(INVITER_SEAT)]);
  });

  it('grants before the phonebook is written, so a contact failure cannot lose it', async () => {
    await make(INVITER_SEAT);

    const order = dbQuery.mock.calls.map((c) => String(c[0]));
    const link = order.findIndex((s) => s.includes('"inviterReferralUserId"'));
    // The INSERT, not the free-number search — that one reads `UserAlias` too
    // and runs first, which made the loose version of this assertion fail for
    // a reason that had nothing to do with ordering.
    const book = order.findIndex((s) => s.includes('INSERT INTO "UserAlias"'));

    expect(link).toBeGreaterThan(-1);
    if (book > -1) expect(link).toBeLessThan(book);
  });
});

describe('who may invite a fiction', () => {
  /**
   * ⚠️ A REAL PERSON MAY NOT. A fictional account invited by somebody real
   * would enter that person's referral chain — and their referral EARNINGS —
   * with an invented registration. That is a write on a real person's data
   * wearing a test's clothes.
   */
  it('refuses an inviter that is not a seat', async () => {
    world({});

    await expect(make('501')).rejects.toBeInstanceOf(SeatCreationRefused);
    expect(grantWhateverFreePeriodIsOwed).not.toHaveBeenCalled();
  });

  it('says which id it refused, rather than failing vaguely', async () => {
    world({});

    await expect(make('501')).rejects.toThrow(/501/);
  });
});
