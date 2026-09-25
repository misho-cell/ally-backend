import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * ⚠️ §54 — RENAMING A SEAT, AND THE TWO LOCKS THAT KEEP IT OFF A PERSON.
 *
 * This exists because a refusal made rows nobody asked for: on 25 September a
 * call the route REFUSED had already written the account, its phone and its
 * `test_seats` row — twice, six seconds apart, 172531 and 172532, both named
 * „Netai Test 42". The creating bug is fixed (§53). These are what it left,
 * and a seat list with one name on several rows is a trap for the next reader.
 *
 * Misho chose renaming over deleting, and the reason is the one that matters:
 * a DELETE here has no undo — `createTestSeat` would make a new id on a new
 * slot and the original could not come back — while a name can be set again
 * in a second.
 *
 * THE THING BEING PROTECTED IS SOMEBODY'S NAME, so it is locked twice: the
 * route refuses an id `test_seats` does not know, and the write scopes itself
 * to seats again. Either one alone would do; both is the point.
 */
const routes = readFileSync(join(__dirname, '..', 'admin.routes.ts'), 'utf8');
const service = readFileSync(
  join(__dirname, '..', '..', '..', 'services', 'testSeatCreate.service.ts'),
  'utf8',
);
const handler = routes.slice(
  routes.indexOf("'/test-accounts/:id/name'"),
  routes.indexOf("'/test-accounts/:id/tokens'"),
);

describe('only a seat can be renamed', () => {
  it('refuses an id the seat table does not know, before writing anything', () => {
    expect(handler).toContain('await isOperableTestSeat(target, isFictionalTestAccount)');
    const guard = handler.indexOf('isOperableTestSeat');
    const write = handler.indexOf('await renameTestSeat');

    expect(guard).toBeGreaterThan(0);
    expect(write).toBeGreaterThan(guard);
  });

  /**
   * The second lock. A real person has no `test_seats` row, so this UPDATE
   * cannot reach them even if the guard above were wrong one day.
   */
  it('scopes the account write to seats a second time', () => {
    const fn = service.slice(service.indexOf('export async function renameTestSeat'));

    expect(fn).toContain('EXISTS (SELECT 1 FROM test_seats ts WHERE ts.user_id = "User".id)');
  });

  it('renames the seat row and the account together', () => {
    const fn = service.slice(service.indexOf('export async function renameTestSeat'));

    expect(fn).toContain('UPDATE test_seats SET name');
    expect(fn).toContain('UPDATE "User" SET name');
  });
});

describe('the change can be undone by whoever reads the log', () => {
  /**
   * §54's UNDO is „set it back", and it is only usable if the old name is
   * written down beside the new one. A log line saying a seat was renamed and
   * not saying from what is not an undo.
   */
  it('prints the old name next to the new one', () => {
    expect(handler).toContain('SELECT name FROM test_seats WHERE user_id = $1::int');
    expect(handler).toContain('renamed seat ${target}:');
    expect(handler).toContain("was.rows[0]?.name ?? '?'");
  });

  it('returns the old name to the caller too', () => {
    expect(handler).toContain('was: was.rows[0]?.name ?? null');
  });

  /** Like the tokens route: a write to live data says why it happened. */
  it('requires a note saying why', () => {
    expect(handler).toContain("body('note').isString().trim().isLength({ min: 3, max: 500 })");
  });
});
