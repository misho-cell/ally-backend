jest.mock('../../db/postgres/client', () => ({ __esModule: true, query: jest.fn() }));
jest.mock('../tokenWallet.service', () => ({
  __esModule: true,
  adjustTestAccountTokens: jest.fn().mockResolvedValue(500),
}));

import { readFileSync } from 'fs';
import { join } from 'path';
import { query } from '../../db/postgres/client';
import { hasActiveSubscription } from '../../api/middleware/subscription.middleware';
import {
  firstFreeFictionalPhone,
  createTestSeat,
  isOperableTestSeat,
  SeatCreationRefused,
} from '../testSeatCreate.service';

const mockQuery = query as jest.MockedFunction<typeof query>;

function rows(data: unknown[]): { rows: unknown[]; rowCount: number } {
  return { rows: data, rowCount: data.length };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockQuery.mockResolvedValue(rows([]) as never);
});

/**
 * ROW 251 — THE TESTER MAKES THEIR OWN FICTIONAL SEATS, AND THE NUMBER IS THE
 * ONLY PART OF IT THAT CAN HURT SOMEBODY.
 *
 * WHY THE ROUTE EXISTS. Row 251's done-when needs a requester, a mediator and
 * a target with NO introduction ever asked between them, and by 23 September
 * every pair across the eleven seats had one — 8 → 10 via 7, 9 → 7 via 8,
 * 3 ↔ 6, 2 ↔ 4 via 3, 3 → 1 via 2. The assistant refuses a second request on a
 * used pair, which is correct behaviour and left the row unprovable.
 *
 * AUTHORIZED TWICE, which is what the founder himself asked for. D464: „you
 * need the permission from me and from Misho to create test accounts because
 * you are the main tester… I have approved it." His own sentence names both,
 * so the relayed quote was treated as half of it and Misho gave the other half
 * directly.
 *
 * AND THE HAZARD IS NOT HYPOTHETICAL. Netai Test 5 sits on +1 202 555 0105, a
 * number a real owner had had in their phonebook since August. Nothing came of
 * that one; the shape is plain. A fictional seat on a number somebody real
 * holds starts appearing in that person's second circle, and their assistant
 * starts treating an invented account as somebody they know.
 */
describe('the number is earned, not chosen', () => {
  it('asks the database for registered AND saved numbers, not only registered', async () => {
    await firstFreeFictionalPhone();

    const [sql] = mockQuery.mock.calls[0] as [string];
    expect(sql).toContain('FROM "UserPhone" WHERE phone = ANY($1)');
    // The half that catches the Netai Test 5 case: nobody has it saved either.
    expect(sql).toContain('FROM "UserAlias" WHERE phone = ANY($1)');
    expect(sql).toContain('FROM test_seats WHERE phone = ANY($1)');
  });

  it('takes the first free slot in the range reserved for fiction', async () => {
    mockQuery.mockResolvedValue(
      rows([{ phone: '+12025550100' }, { phone: '+12025550101' }]) as never,
    );

    expect(await firstFreeFictionalPhone()).toBe('+12025550102');
  });

  it('refuses rather than wandering outside the range when it is full', async () => {
    const all = [];
    for (let slot = 100; slot <= 199; slot += 1) all.push({ phone: `+12025550${slot}` });
    mockQuery.mockResolvedValue(rows(all) as never);

    await expect(firstFreeFictionalPhone()).rejects.toBeInstanceOf(SeatCreationRefused);
  });

  /** The caller cannot hand one in: a number a caller supplies is unchecked. */
  it('takes no phone from its caller', () => {
    const src = readFileSync(join(__dirname, '..', 'testSeatCreate.service.ts'), 'utf8');
    const at = src.indexOf('export async function createTestSeat');
    const signature = src.slice(at, at + 260);

    expect(signature).not.toContain('phone');
  });
});

describe('creating one', () => {
  function seatCreated(): void {
    mockQuery.mockResolvedValue(rows([]) as never);
    mockQuery.mockResolvedValueOnce(rows([]) as never); // the free-number scan
    mockQuery.mockResolvedValueOnce(rows([{ id: 200001 }]) as never); // the User insert
  }

  it('makes the account the same shape as the eleven that exist', async () => {
    seatCreated();

    await createTestSeat('Netai Test 12', [], 500, 'admin:1', 'row 251');

    const insert = mockQuery.mock.calls.find(([sql]) =>
      (sql as string).includes('INSERT INTO "User"'),
    );
    // subscription_status 'active' is what makes it a NETAI USER for
    // isNetaiUser — a seat that is not one cannot be asked anything, which is
    // the first thing anybody would test and the first thing that would fail.
    expect(insert?.[0]).toContain("'active'");
    expect(insert?.[0]).toContain("'pro'");
    expect(insert?.[0]).toContain('"hasAccessToAlly"');
  });

  /**
   * AND THE SEAT CAN ACTUALLY OPEN A CHAT, WHICH THE THREE FIRST ONES COULD
   * NOT — asked of the product's own gate rather than of the column names.
   *
   * The first version set tier, status and `hasAccessToAlly`, because those
   * are the columns the words „is this account active" bring to mind. All
   * three seats came out with `current_period_ends_at` NULL and every one got
   * 403 `subscription_required` on POST /threads, twenty minutes later. They
   * could be read, they had tokens, they were Netai users, and they could not
   * say a word.
   *
   * `hasActiveSubscription` reads the PERIOD END, not the status. So this test
   * does not match a string in the INSERT — a string test would have passed on
   * the broken version too, because the broken version named all the columns
   * it thought of. It builds the row this INSERT produces and asks the gate.
   */
  it('produces a row the product’s own subscription gate lets through', async () => {
    seatCreated();

    await createTestSeat('Netai Test 12', [], 0, 'admin:1', 'row 251');

    const [sql] = mockQuery.mock.calls.find(([q]) =>
      (q as string).includes('INSERT INTO "User"'),
    ) as [string];

    // Every column the gate reads has to be set by that statement, and the
    // period end has to be in the future — which is the half that was missing.
    expect(sql).toContain('current_period_ends_at');
    const aYearOn = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();
    expect(
      hasActiveSubscription({
        subscription_status: 'active',
        trial_ends_at: null,
        current_period_ends_at: aYearOn,
        subscription_status_changed_at: null,
      }),
    ).toBe(true);
    // And the shape WITHOUT it — the one that shipped — is refused, so this
    // test fails if the column is ever dropped again.
    expect(
      hasActiveSubscription({
        subscription_status: 'active',
        trial_ends_at: null,
        current_period_ends_at: null,
        subscription_status_changed_at: null,
      }),
    ).toBe(false);
  });

  it('records the seat, with the number it took and who asked', async () => {
    seatCreated();

    await createTestSeat('Netai Test 12', [], 0, 'admin:1', 'row 251');

    const insert = mockQuery.mock.calls.find(([sql]) =>
      (sql as string).includes('INSERT INTO test_seats'),
    );
    expect((insert?.[1] as unknown[])[2]).toBe('+12025550100');
    expect((insert?.[1] as unknown[])[3]).toBe('admin:1');
  });

  it('needs a reason, like every other admin write here', async () => {
    await expect(createTestSeat('Netai Test 12', [], 0, 'admin:1', 'x')).rejects.toBeInstanceOf(
      SeatCreationRefused,
    );
  });

  /**
   * A PHONE THAT IS NOT A SEAT IS REFUSED BY NAME, not skipped. Silently
   * dropping it would leave the caller believing in an edge that does not
   * exist, and row 251 is entirely about which edges exist.
   */
  it('will not put a stranger into a seat’s phonebook', async () => {
    mockQuery.mockResolvedValue(rows([]) as never);
    mockQuery.mockResolvedValueOnce(rows([]) as never);
    mockQuery.mockResolvedValueOnce(rows([{ id: 200001 }]) as never);

    await expect(
      createTestSeat('Netai Test 12', ['+995599123456'], 0, 'admin:1', 'row 251'),
    ).rejects.toThrow(/not test seats/);
  });
});

/**
 * THE OPERATING CHECK IS SEPARATE FROM THE COSMETIC ONE, AND THAT IS THE WHOLE
 * CARE IN THIS CHANGE.
 *
 * `isFictionalTestAccount` is a lookup in a hardcoded Set with no I/O, and a
 * comment in `mcp/handlers.ts` leans on exactly that: the inbox marks a
 * counterpart fictional by absence, which is only honest while the check
 * „has no failure mode". Giving that one a query would turn „I could not look"
 * into „there is nobody there" — the confusion this project has spent a week
 * hunting.
 */
describe('which seats the admin routes may operate', () => {
  it('answers from source without touching the database', async () => {
    expect(await isOperableTestSeat('171872', (id) => id === '171872')).toBe(true);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('then looks for one this route created', async () => {
    mockQuery.mockResolvedValue(rows([{ user_id: 200001 }]) as never);

    expect(await isOperableTestSeat('200001', () => false)).toBe(true);
  });

  /** „I cannot read the list" must never look like „this is not a test account". */
  it('throws rather than saying no when it cannot read', async () => {
    mockQuery.mockRejectedValue(new Error('down') as never);

    await expect(isOperableTestSeat('200001', () => false)).rejects.toThrow('down');
  });

  it('leaves the cosmetic marker on the hardcoded Set alone', () => {
    const tokens = readFileSync(join(__dirname, '..', 'testSeatTokens.ts'), 'utf8');
    const at = tokens.indexOf('export function isFictionalTestAccount');

    expect(tokens.slice(at, at + 200)).toContain('FICTIONAL_TEST_ACCOUNTS.has');
    expect(tokens.slice(at, at + 200)).not.toContain('await');
  });
});

/** And the wire: the two operating routes ask the widened question. */
describe('the routes that operate a seat', () => {
  const admin = readFileSync(
    join(__dirname, '..', '..', 'api', 'routes', 'admin.routes.ts'),
    'utf8',
  );

  it.each([
    ['the token top-up', '!(await isOperableTestSeat(target, isFictionalTestAccount))'],
    ['the seat token mint', 'await isOperableTestSeat(requested, isFictionalTestAccount)'],
  ])('%s asks it', (_name, call) => {
    expect(admin).toContain(call);
  });

  /** The mint still refuses on its own when nothing vouched for the id. */
  it('does not let the verified flag be a way round the check', () => {
    const tokens = readFileSync(join(__dirname, '..', 'testSeatTokens.ts'), 'utf8');
    expect(tokens).toContain('if (!verified && !isFictionalTestAccount(id))');
  });
});
