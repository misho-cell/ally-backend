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

import { readFileSync } from 'fs';
import { join } from 'path';

import { query } from '../../../db/postgres/client';
import { sendPushNotification } from '../../notification.service';
import { requestIntroduction } from '../requestIntroduction';

const mockQuery = query as jest.MockedFunction<typeof query>;
const mockPush = sendPushNotification as jest.MockedFunction<typeof sendPushNotification>;

const MEDIATOR_PHONE = '+995599000107';

/**
 * ⚠️ ITEM I — THE SAME INTRODUCTION WAS ASKED FOR THREE TIMES, AND THE
 * MEDIATOR HAD ALREADY SAID YES.
 *
 * The tester, 25 September: Test 15 asked Test 16 about Test 17 three times in
 * one day. Three separate requests reached Test 16, and `get_intro_status`
 * showed the earlier acceptance the whole time.
 *
 * The duplicate guard read `status = 'pending'` and nothing else. The moment
 * the mediator ANSWERED, the row stopped being pending and the identical
 * request went out again. A guard that only knows „a question is in flight"
 * cannot see „this was already answered" — and the second is the one that puts
 * a message on a real person's phone for no reason.
 *
 * NOT A TEST-ONLY PROBLEM. On the live base: 11 requests went out after an
 * acceptance of the same pair and name within thirty days, and THREE of them
 * had no test seat on either side. 27 August to today.
 */
interface Answer {
  success?: boolean;
  reason?: string;
  error?: string;
  days_waiting?: number;
}

/** `status` is what the guard now reads; `rows: []` means „nothing on file". */
function theRequestOnFile(rows: { id: number; status: string; days_waiting?: number }[]): void {
  mockQuery.mockImplementation((sql: string) => {
    const text = String(sql);
    if (text.includes('"UserAlias"')) {
      return Promise.resolve({
        rows: [{ phone: MEDIATOR_PHONE, display_name: 'Netai Test 16' }],
        rowCount: 1,
      } as never);
    }
    if (text.includes('FROM "UserPhone"')) {
      return Promise.resolve({ rows: [{ userId: 171938 }], rowCount: 1 } as never);
    }
    if (text.includes('FROM threads')) {
      return Promise.resolve({ rows: [{ threads: '4' }], rowCount: 1 } as never);
    }
    if (text.includes('FROM introduction_requests')) {
      return Promise.resolve({ rows, rowCount: rows.length } as never);
    }
    if (text.includes('INSERT INTO introduction_requests')) {
      return Promise.resolve({ rows: [{ id: 5, request_ref: 'req_5' }], rowCount: 1 } as never);
    }
    return Promise.resolve({ rows: [{ id: 1, name: 'Netai Test 15' }], rowCount: 1 } as never);
  });
}

async function askAgain(): Promise<Answer> {
  return (await requestIntroduction(
    '171937',
    'Netai Test 16',
    'Netai Test 17',
    'could you introduce us?',
    MEDIATOR_PHONE,
  )) as Answer;
}

const insertsAttempted = (): number =>
  mockQuery.mock.calls.filter((c) => String(c[0]).includes('INSERT INTO introduction_requests'))
    .length;

/**
 * ⚠️ THE SQL THE GUARD ACTUALLY SENT, because the mock cannot filter by it.
 *
 * `theRequestOnFile` hands back whatever row it is given no matter what the
 * WHERE clause says — so with the fix REVERTED, the three behavioural tests
 * below still passed. They were exercising the TypeScript branch I had just
 * written and not the clause that is the bug. Same fault as the warm-path mock
 * an hour ago: a test can only see what the mock lets through.
 *
 * So the behavioural test also reads the query it caused.
 */
const duplicateGuardSql = (): string =>
  String(
    mockQuery.mock.calls.find(
      (c) =>
        String(c[0]).includes('FROM introduction_requests') && !String(c[0]).includes('INSERT'),
    )?.[0] ?? '',
  );

beforeEach(() => jest.clearAllMocks());

describe('a mediator who already agreed is not asked again', () => {
  /**
   * The control. Without it „nothing was written" would pass for a request
   * refused for some entirely unrelated reason.
   */
  it('sends the request when nothing is on file', async () => {
    theRequestOnFile([]);

    const result = await askAgain();

    expect(result.success).toBe(true);
    expect(insertsAttempted()).toBe(1);
  });

  it('refuses when the same pair and name was already accepted', async () => {
    theRequestOnFile([{ id: 9, status: 'accepted' }]);

    const result = await askAgain();

    expect(result.success).toBe(false);
    expect(result.reason).toBe('already_accepted');
    // And the row was one the QUERY would really have returned.
    expect(duplicateGuardSql()).toContain("status = 'accepted'");
    expect(duplicateGuardSql()).toContain('COALESCE(responded_at, created_at)');
  });

  it('writes nothing and sends no push on that refusal', async () => {
    theRequestOnFile([{ id: 9, status: 'accepted' }]);

    await askAgain();

    expect(insertsAttempted()).toBe(0);
    expect(mockPush).not.toHaveBeenCalled();
  });

  /**
   * „It threw" is not „it refused" and „it refused" is not „it refused
   * usefully". The reply has to leave the model somewhere to go, or it asks
   * again by another route — which is the whole shape of this bug.
   */
  it('tells the model the yes already exists and where to look', async () => {
    theRequestOnFile([{ id: 9, status: 'accepted' }]);

    const result = await askAgain();

    expect(String(result.error)).toContain('უკვე დათანხმდა');
    expect(String(result.error)).toContain('get_intro_status');
  });

  /** The pending case keeps its own wording — two refusals, two reasons. */
  it('still refuses a request that is merely in flight, and says so differently', async () => {
    theRequestOnFile([{ id: 9, status: 'pending' }]);

    const result = await askAgain();

    expect(result.success).toBe(false);
    expect(result.reason).toBe('already_pending');
    expect(String(result.error)).toContain('უკვე გაგზავნილია');
  });
});

const source = (): string => readFileSync(join(__dirname, '..', 'requestIntroduction.ts'), 'utf8');

describe('what the guard deliberately does not catch', () => {
  /**
   * A decline is not caught. Asking again after a „no" can be legitimate when
   * something has changed, and I have no evidence about how often it is not —
   * so it is left alone rather than guessed at. This test exists so that
   * „declines are allowed through" stays a decision on the record instead of
   * becoming an accident somebody tidies up later.
   */
  it('lets a request through after a decline', () => {
    // ⚠️ Asserted on the SQL, not through the mock. The first version of this
    // test fed the guard an empty result and watched the request succeed —
    // which proves only that the MOCK returned nothing. The question is
    // whether the QUERY would have returned the declined row, and only the
    // WHERE clause can answer that.
    const guard = source().slice(
      source().indexOf('const dupResult'),
      source().indexOf('const [insertResult'),
    );

    expect(guard).not.toContain('declined');
    expect(guard.match(/status = 'pending'/g)).toHaveLength(4);
    expect(guard.match(/status = 'accepted'/g)).toHaveLength(2);
  });

  it('only counts an acceptance from the last thirty days', () => {
    const src = source();

    expect(src).toContain('const ACCEPTED_STILL_COUNTS_DAYS = 30;');
    expect(src).toContain("INTERVAL '${ACCEPTED_STILL_COUNTS_DAYS} days'");
  });

  /**
   * ⚠️ THE FIRST VERSION OF THIS QUERY COMPARED `updated_at`, WHICH THIS TABLE
   * DOES NOT HAVE. It has `responded_at` and `created_at`. It typechecked
   * perfectly — SQL in a template literal is a string — and would have thrown
   * on every single request_introduction call, which is very much worse than
   * the bug being fixed. Caught by reading the live schema before trusting it,
   * and both variants were then run against the real database.
   */
  it('reads a column the table actually has', () => {
    const src = source();
    const guard = src.slice(src.indexOf('const dupResult'), src.indexOf('const [insertResult'));

    expect(guard).toContain('COALESCE(responded_at, created_at)');
    expect(guard).not.toContain('updated_at');
  });
});

/**
 * ⚠️ ITEM P — NOTHING EVER EXPIRES A PENDING INTRODUCTION, and this guard is
 * where that stops being clutter and becomes a dead end.
 *
 * On the live base: SIXTEEN requests still `pending`, FOURTEEN of them older
 * than thirty days, the oldest from 19 JUNE — over three months. Seven
 * requesters.
 *
 * So the branch above refuses today's request on the strength of one nobody
 * answered a quarter of a year ago, and says only „already sent" — which reads
 * as „it is on its way". The requester cannot ask again and is told nothing
 * that would let them do anything else.
 *
 * THE REFUSAL DELIBERATELY STILL STANDS. Letting a second request through
 * would put a second card on the mediator's phone, and that is a product
 * decision. Expiring the sixteen rows is a write across live data and waits on
 * Misho in docs/ADMIN_WRITE_OPERATIONS.md. What changed is only what the
 * refusal SAYS, which needs nobody's permission — and that is the half that
 * was costing a real person something today.
 */
describe('an unanswered request says how long it has been unanswered', () => {
  it('names the wait once it is stale, and still refuses', async () => {
    theRequestOnFile([{ id: 9, status: 'pending', days_waiting: 98 }]);

    const result = await askAgain();

    expect(result.success).toBe(false);
    expect(result.reason).toBe('already_pending');
    expect(result.days_waiting).toBe(98);
    expect(String(result.error)).toContain('98 დღეა უპასუხოდ');
    expect(insertsAttempted()).toBe(0);
  });

  /**
   * „Do not leave it looking as though an answer is on its way" is the whole
   * point — a refusal the model cannot act on is how the person is left
   * waiting on something that will never arrive.
   */
  it('tells the model to offer the person a way out', async () => {
    theRequestOnFile([{ id: 9, status: 'pending', days_waiting: 40 }]);

    const result = await askAgain();

    expect(String(result.error)).toContain('სხვა შუამავალი');
    expect(String(result.error)).toContain('ნუ დატოვებ');
  });

  /** A request sent this morning is not stale, and must not be described as if it were. */
  it('says nothing about waiting when the request is fresh', async () => {
    theRequestOnFile([{ id: 9, status: 'pending', days_waiting: 1 }]);

    const result = await askAgain();

    expect(result.reason).toBe('already_pending');
    expect(String(result.error)).not.toContain('უპასუხოდ');
    expect(String(result.error)).toContain('უკვე გაგზავნილია');
  });

  it('reads the age from the database rather than guessing it', () => {
    const guard = source().slice(
      source().indexOf('const dupResult'),
      source().indexOf('const [insertResult'),
    );

    expect(guard).toContain('EXTRACT(EPOCH FROM (NOW() - created_at)) / 86400');
    expect(source()).toContain('const UNANSWERED_IS_STALE_DAYS = 14;');
  });
});
