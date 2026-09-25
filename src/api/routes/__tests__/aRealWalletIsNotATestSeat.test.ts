import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * §57 — TOPPING UP A REAL PERSON'S WALLET.
 *
 * Authorised by Misho on 25 September: „ნინიას საფულე შეავსე." Registered in
 * docs/ADMIN_WRITE_OPERATIONS.md before a line of it was written, which is
 * what D44 asks for.
 *
 * ⚠️ THIS IS THE THING §19 WAS WRITTEN TO AVOID. That route is guarded by
 * `isOperableTestSeat` and CANNOT reach a real person — which is the whole
 * reason it was allowed to exist at all. Ninia Abramishvili is a real account,
 * so §19 refuses her, and it is right to.
 *
 * So the capability is new and it is narrow: one signed amount, a written
 * reason, the ceiling §19 already uses, a test seat refused and pointed at its
 * own door, and a log line naming the PERSON and both balances.
 *
 * WHY THE AMOUNT IS 250 AND NOT A FIGURE I LIKED: her allowance is weekly and
 * it is 250 — w:2026-W37, W38, W39, the last on 21 September. She spent it and
 * went three over. 250 is the product's own unit for her and what Monday would
 * have given her anyway.
 */
const route = readFileSync(join(__dirname, '..', 'admin.routes.ts'), 'utf8');
const register = readFileSync(
  join(__dirname, '..', '..', '..', '..', 'docs', 'ADMIN_WRITE_OPERATIONS.md'),
  'utf8',
);

const fn = route.slice(
  route.indexOf("  '/users/:id/tokens',"),
  route.indexOf("  '/test-accounts/:id/tokens',"),
);

describe('it reaches a real person, and says so', () => {
  it('exists as its own route rather than widening §19', () => {
    expect(route).toContain("'/users/:id/tokens',");
    // §19's guard is untouched: a real person is still refused there.
    expect(route).toContain('isOperableTestSeat(target, isFictionalTestAccount)');
  });

  it('refuses a test seat and names the door that serves it', () => {
    expect(fn).toContain('That is a fictional test seat');
    expect(fn).toContain('POST /admin/test-accounts/:id/tokens');
  });

  it('refuses an unknown or deleted account', () => {
    expect(fn).toContain('u."deletedAt" IS NULL');
    expect(fn).toContain("error: 'No such account.'");
  });
});

describe('what it cannot do', () => {
  it('keeps §19’s ceiling rather than inventing a second one', () => {
    expect(fn).toContain('min: -MAX_ADMIN_TOKEN_ADJUSTMENT, max: MAX_ADMIN_TOKEN_ADJUSTMENT');
  });

  it('refuses zero and demands a written reason', () => {
    expect(fn).toContain("error: 'tokens must not be zero.'");
    expect(fn).toContain("body('note').isString().trim().isLength({ min: 3, max: 500 })");
  });
});

describe('it can always be undone and always be traced', () => {
  /**
   * The undo is the same call with the number negated — a reversal is a row
   * beside the grant, never a deletion. `was` rides back in the reply so the
   * undo does not depend on somebody finding a log line.
   */
  it('returns the balance it started from', () => {
    expect(fn).toContain('const was = await getBalance(target);');
    expect(fn).toContain('was,');
  });

  it('names the person and both balances in the log', () => {
    expect(fn).toContain('person.name ?? target');
    expect(fn).toContain('${was} -> ${balance}');
  });

  it('writes an admin_adjust row through the reviewed path, not a new one', () => {
    expect(fn).toContain('adjustTestAccountTokens(');
    expect(fn).toContain('admin:${randomUUID()}');
  });
});

describe('the register was written first', () => {
  it('carries route, body and undo', () => {
    expect(register).toContain('## 57 · TOP UP A REAL PERSON');
    expect(register).toContain('POST /admin/users/:id/tokens');
    expect(register).toContain('the same call with the number negated');
  });

  /**
   * An admin top-up carries no period key, and expireStaleGrants burns only
   * the unused part of a period grant — „spending counts against the grant
   * first, so purchased/top-up/admin tokens survive rollover". Checked before
   * choosing the amount, because a top-up swept away on Monday would have
   * been worth nothing.
   */
  it('records that it survives the weekly expiry', () => {
    // Matched on a fragment that is not split by the markdown wrap: the quote
    // breaks the line between „survive" and „rollover", so the whole phrase
    // is not a substring of the file. Third time today I have asserted a
    // string that only exists once something has joined the lines.
    expect(register).toContain('IT SURVIVES MONDAY');
    expect(register).toContain('admin tokens survive');
  });
});
