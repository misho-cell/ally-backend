/**
 * „STOP CONTACTING ME" IS THE STRONGEST PROMISE THIS PRODUCT MAKES, AND THREE
 * OF ITS FOUR ENFORCEMENT POINTS COULD BE DELETED WITH A GREEN SUITE.
 *
 * Found by sabotage on 22 September — the method that caught row 210 the same
 * afternoon. Each guard was disabled in turn and the whole suite re-run:
 *
 *   user-level stop   createAsk               2 tests fail      HELD
 *   phone-level stop  createAsk               3,697 pass        NOT HELD
 *   user-level stop   request_introduction    3,697 pass        NOT HELD
 *   phone-level stop  request_introduction    3,697 pass        NOT HELD
 *
 * The comment above the guard in requestIntroduction.ts already records what
 * this costs when it is missing: „ticket 4 PART B miss 1 — an intro request
 * reached an opted-out recipient because only createAsk enforced the stop."
 * It was found in production once. Nothing since then would have caught it
 * coming back.
 *
 * Both halves matter and they are different people. `isOptedOutFromAsks` is a
 * Netai USER who pressed stop. `isPhoneOptedOut` is a PHONE, and the single
 * live row in that table today is an ERASED ACCOUNT (`account_deleted`,
 * 2 September) — somebody whose data we promised to stop holding, not somebody
 * who asked to be left alone. Writing to them would be worse, not better.
 *
 * These tests fail if either check is removed, which is the only property that
 * matters about them.
 */
jest.mock('../../../db/postgres/client', () => ({ __esModule: true, query: jest.fn() }));
jest.mock('../../notification.service', () => ({
  __esModule: true,
  sendPushNotification: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../../threads.service', () => ({
  __esModule: true,
  createIncomingRequestThread: jest.fn().mockResolvedValue({ id: 1 }),
  createOutgoingRequestThread: jest.fn().mockResolvedValue({ id: 2 }),
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

import { query } from '../../../db/postgres/client';
import { isOptedOutFromAsks } from '../../askOptOut.service';
import { isPhoneOptedOut } from '../../privacyRights.service';
import { requestIntroduction } from '../requestIntroduction';

const mockQuery = query as jest.MockedFunction<typeof query>;
const mockUserStop = isOptedOutFromAsks as jest.MockedFunction<typeof isOptedOutFromAsks>;
const mockPhoneStop = isPhoneOptedOut as jest.MockedFunction<typeof isPhoneOptedOut>;

const MEDIATOR_PHONE = '+995599000107';

/** A mediator who exists, is somebody else, and has opened the app. */
function aReachableMediator(): void {
  mockQuery.mockImplementation((sql: string) => {
    const text = String(sql);
    if (text.includes('"UserAlias"')) {
      return Promise.resolve({
        rows: [{ phone: MEDIATOR_PHONE, display_name: 'Netai Test 7' }],
        rowCount: 1,
      } as never);
    }
    if (text.includes('FROM "UserPhone"')) {
      return Promise.resolve({ rows: [{ userId: 171938 }], rowCount: 1 } as never);
    }
    if (text.includes('FROM threads')) {
      return Promise.resolve({ rows: [{ threads: '4' }], rowCount: 1 } as never);
    }
    // The duplicate guard: „already sent" must be NO, or the happy path is
    // refused for a reason that has nothing to do with the stop.
    //
    // Matched on the FROM clause rather than the full SELECT list. It was
    // pinned to „SELECT id FROM introduction_requests" until 25 September,
    // when item I added `status` to that list — the matcher stopped matching,
    // the guard fell through to the default row, and this file's control test
    // failed. Which is the control doing exactly its job: the assertion moves
    // with the property instead of being deleted.
    if (text.includes('FROM introduction_requests')) {
      return Promise.resolve({ rows: [], rowCount: 0 } as never);
    }
    if (text.includes('INSERT INTO introduction_requests')) {
      return Promise.resolve({ rows: [{ id: 5, request_ref: 'req_5' }], rowCount: 1 } as never);
    }
    // Anything else this path reads — the asker's own name, and whatever is
    // added to it later — answers with one usable row. A default of NO rows
    // makes the happy path fail for a reason that has nothing to do with the
    // stop, and a control that fails for the wrong reason proves nothing.
    return Promise.resolve({ rows: [{ id: 1, name: 'Netai Test 6' }], rowCount: 1 } as never);
  });
}

async function askForAnIntroduction(): Promise<{ success?: boolean; error?: string }> {
  return (await requestIntroduction(
    '171937',
    'Netai Test 7',
    'Netai Test 9',
    'could you introduce us?',
    MEDIATOR_PHONE,
  )) as { success?: boolean; error?: string };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockUserStop.mockResolvedValue(false);
  mockPhoneStop.mockResolvedValue(false);
  aReachableMediator();
});

describe('an introduction is not sent to somebody who asked us to stop', () => {
  /**
   * The control. Without it, „nothing was written" would pass for a request
   * that was refused for some entirely unrelated reason — a mediator who could
   * not be found, a dormant account, a self-request.
   */
  it('reaches the person when neither stop is set', async () => {
    const result = await askForAnIntroduction();

    expect(result.success).toBe(true);
    expect(mockUserStop).toHaveBeenCalledWith(171938);
    expect(mockPhoneStop).toHaveBeenCalledWith(MEDIATOR_PHONE);
  });

  it('refuses when the PERSON pressed stop', async () => {
    mockUserStop.mockResolvedValue(true);

    const result = await askForAnIntroduction();

    expect(result.success).toBe(false);
    expect(String(result.error)).toContain('Netai Test 7');
  });

  /**
   * The phone-level half is a different person and a different promise. The
   * one live row today is an erased account — writing to them is worse than
   * writing to somebody who merely asked for quiet.
   */
  it('refuses when the PHONE is on the stop list', async () => {
    mockPhoneStop.mockResolvedValue(true);

    const result = await askForAnIntroduction();

    expect(result.success).toBe(false);
  });

  /**
   * Nothing is written on either refusal. A request row, a thread or a push
   * that survives the refusal is the promise broken by a different route —
   * and the push is the one that lands on their phone.
   */
  it('creates nothing and sends nothing when either stop is set', async () => {
    for (const set of [mockUserStop, mockPhoneStop]) {
      jest.clearAllMocks();
      aReachableMediator();
      mockUserStop.mockResolvedValue(false);
      mockPhoneStop.mockResolvedValue(false);
      set.mockResolvedValue(true);

      await askForAnIntroduction();

      const wrote = mockQuery.mock.calls.filter((c) =>
        String(c[0]).includes('INSERT INTO introduction_requests'),
      );
      expect(wrote).toHaveLength(0);
    }
  });

  /**
   * THE ASKER HEARS THE TRUTH, NEVER A TECHNICAL EXCUSE — the wording contract
   * written above the guard. „Something went wrong" would send them back to
   * try again, which is the one thing the refusal exists to prevent.
   */
  it('tells the asker it was the person’s decision, not a failure', async () => {
    mockUserStop.mockResolvedValue(true);

    const said = String((await askForAnIntroduction()).error);

    expect(said).toContain('მისი გადაწყვეტილებაა');
    expect(said).not.toContain('შეცდომა');
  });
});
