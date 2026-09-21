jest.mock('../../db/postgres/client', () => ({ query: jest.fn(), __esModule: true }));

import { readFileSync } from 'fs';
import { join } from 'path';
import { query } from '../../db/postgres/client';
import { takeGraceAnswer } from '../tokenWallet.service';

const mockQuery = query as jest.MockedFunction<typeof query>;

/**
 * Row 221 — D348 item 2. The founder, 20 September: at zero the person's next
 * message is still ACCEPTED AND ANSWERED ONCE, and the top-up wall comes after
 * that answer rather than instead of it.
 *
 * What the seat measured on 21 September, single runs, no concurrency: seat
 * 171873 walked 30 → 15, one more question took it 15 → −16 in a single run,
 * and the next message (thread 20760, 15:16:27) got HTTP 402 in 0.3 seconds
 * with no answer at all. The wall stood in the answer's place.
 */
describe('one answer on an empty balance, and only one', () => {
  beforeEach(() => jest.clearAllMocks());

  it('is claimed and checked in a single UPDATE', async () => {
    mockQuery.mockResolvedValue({ rows: [{ id: 1 }], rowCount: 1 } as never);

    await expect(takeGraceAnswer('171873')).resolves.toBe(true);

    const sql = String(mockQuery.mock.calls[0][0]);
    expect(sql).toContain('UPDATE "User"');
    expect(sql).toContain('grace_answer_used_at = NOW()');
    expect(sql).toContain('RETURNING id');
    expect(mockQuery.mock.calls[0][1]).toEqual(['171873']);
  });

  it('is refused once it has been used this window', async () => {
    mockQuery.mockResolvedValue({ rows: [], rowCount: 0 } as never);
    await expect(takeGraceAnswer('171873')).resolves.toBe(false);
  });

  /**
   * A SELECT then an UPDATE would hand the grace out twice under exactly the
   * load that makes somebody run out — the seat's own four-parallel-run
   * overdraw is that load. One statement decides and claims.
   */
  it('reads nothing before it writes', async () => {
    mockQuery.mockResolvedValue({ rows: [], rowCount: 0 } as never);
    await takeGraceAnswer('171873');
    expect(mockQuery).toHaveBeenCalledTimes(1);
  });

  /** It renews with the allowance rather than by hand. */
  it('compares against the current budget window, not a fixed date', async () => {
    mockQuery.mockResolvedValue({ rows: [], rowCount: 0 } as never);
    await takeGraceAnswer('171873');
    const sql = String(mockQuery.mock.calls[0][0]);
    expect(sql).toContain('grace_answer_used_at IS NULL');
    expect(sql).toMatch(/date_trunc\('(month|week)', NOW\(\)\)/);
  });
});

/**
 * And it has to be claimed where the run PROCEEDS. Everything after that gate
 * in the route is the wall, and the point of the ruling is to get past it once.
 * Comments stripped: the block above quotes the rule, and a plain search would
 * go green against my own note about the fix.
 */
describe('the send path takes it before it refuses', () => {
  const code = readFileSync(
    join(__dirname, '..', '..', 'api', 'routes', 'threads.routes.ts'),
    'utf8',
  )
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '');

  it('lets the first message through instead of walling it', () => {
    const at = code.indexOf('takeGraceAnswer(userId)');
    expect(at).toBeGreaterThan(-1);
    // The grace branch comes FIRST; the 402 is the else.
    expect(at).toBeLessThan(code.indexOf("reason: 'insufficient_tokens'"));
    expect(code).toContain('} else if (!allowance.allowed && payerId === userId) {');
  });

  /**
   * „At zero" is „below zero" for almost everyone — a single run took +15 to
   * −16 — so the grace fires on the ALLOWANCE being refused, never on a
   * balance being exactly nought.
   */
  it('does not test the balance for zero', () => {
    const at = code.indexOf('takeGraceAnswer(userId)');
    const gate = code.slice(Math.max(0, at - 200), at);
    expect(gate).toContain('!allowance.allowed');
    expect(gate).not.toMatch(/balance\s*===?\s*0/);
  });

  /** The person is not left thinking the balance is fine while it is spent. */
  it('still puts the top-up badge on the thread', () => {
    const at = code.indexOf('takeGraceAnswer(userId)');
    const branch = code.slice(at, at + 500);
    expect(branch).toContain('needs_topup');
  });
});
