import jwt from 'jsonwebtoken';
import {
  fictionalTestAccountIds,
  isFictionalTestAccount,
  mintTestSeatToken,
  NotATestAccountError,
} from '../testSeatTokens';

const SECRET = 'test-secret-not-a-real-one';

/**
 * The seat's 361 asked to „act as a named test user with the admin token it
 * already holds — no phone, no code, no human", and I refused it: as written
 * it was a way to become ANY user, and a seat that can become anybody outlives
 * the reason it was built.
 *
 * Their 370 scoped it — „only fictional test accounts, never a real person's
 * login, and we are not asking for one" — and that is a test fixture, not an
 * authentication bypass. These tests are the line between the two.
 */
describe('a test-seat token reaches the six fictional accounts and nothing else', () => {
  it.each(['171870', '171871', '171872', '171873', '171874', '171936'])(
    'mints for Netai Test account %s',
    (id) => {
      const minted = mintTestSeatToken(id, SECRET);
      const decoded = jwt.verify(minted.token, SECRET) as { userId: string; role: string };
      expect(decoded.userId).toBe(id);
      // A USER token, never an admin one — the seat must see what a person sees.
      expect(decoded.role).toBe('user');
    },
  );

  /**
   * THE WHOLE POINT. Every id below is a real account in this product —
   * 501 is the founder, 160584 is Lika, 167250 is the shared login, 963 and
   * 116793 are ordinary users. None of them is reachable through this, by an
   * admin, by mistake, or by asking.
   */
  it.each(['501', '160584', '167250', '963', '116793', '1', '0', '171875'])(
    'refuses %s, which is not fictional',
    (id) => {
      expect(() => mintTestSeatToken(id, SECRET)).toThrow(NotATestAccountError);
      expect(isFictionalTestAccount(id)).toBe(false);
    },
  );

  it('names the id it refused, so the refusal is diagnosable', () => {
    expect(() => mintTestSeatToken('501', SECRET)).toThrow(/501 is not one of the fictional/);
  });

  it('is not fooled by padding around the id', () => {
    expect(isFictionalTestAccount('  171870 ')).toBe(true);
    expect(isFictionalTestAccount('171870 OR 1=1')).toBe(false);
    expect(isFictionalTestAccount('0171870')).toBe(false);
  });

  /**
   * Twelve hours, matching an admin session. A fixture does not need thirty
   * days, and a thirty-day token is the one that turns up later in somebody's
   * shell history.
   */
  it('expires in hours, not in months', () => {
    const minted = mintTestSeatToken('171870', SECRET);
    expect(minted.expiresIn).toBe('12h');
    const decoded = jwt.verify(minted.token, SECRET) as { exp: number; iat: number };
    expect(decoded.exp - decoded.iat).toBe(12 * 60 * 60);
  });

  /**
   * THE LIST IS SPELLED OUT SO A WIDENING CANNOT BE QUIET, and on 22 September
   * it did its job: adding five ids made this the only failing test in the
   * suite, which is exactly the moment somebody has to say why.
   *
   * Why the five. The seat needed a fictional account whose pairs had never
   * been used, so rows 210 and 232 could be proved at all. Netai Test 7-11
   * already existed — made 19 September in one batch, untouched since — and
   * were unreachable only because this list stopped at six.
   *
   * Verified before being written down, as the first six were, and §7a of
   * ADMIN_WRITE_OPERATIONS is why that is not a formality: Netai Test 5 sits
   * on a number a real owner has had in their phonebook since August. For
   * these five, every holder of 0107-0111 is itself a test seat. No real
   * person's phonebook is touched by any of them.
   */
  it('lists exactly the verified ids, so a widening shows up as a failing test', () => {
    expect(fictionalTestAccountIds()).toHaveLength(11);
    expect([...fictionalTestAccountIds()].sort()).toEqual([
      '171870',
      '171871',
      '171872',
      '171873',
      '171874',
      '171936',
      '171937',
      '171938',
      '171939',
      '171940',
      '171941',
    ]);
  });
});
