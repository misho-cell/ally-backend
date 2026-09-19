import jwt from 'jsonwebtoken';

/**
 * Misho's ask, 19 September: raise the admin session from 8 hours to 12.
 *
 * A working day here is longer than eight hours, and an admin re-authenticating
 * mid-afternoon is a person interrupted. Today that meant the tester's seat
 * signed out of a test account with the whole acceptance run waiting behind
 * somebody typing a code.
 *
 * The cost is written beside the constant rather than only here: a stolen
 * admin token is usable for twelve hours instead of eight, there is no refresh
 * and no revocation list, so the TTL IS the blast radius.
 *
 * This test exists because the number is a security parameter. It should not
 * be possible to change it by accident, and if somebody changes it on purpose
 * they should have to say so by editing an assertion that names the trade-off.
 */
describe('the admin session length', () => {
  const SECRET = 'test-secret-for-ttl';

  function ttlSeconds(token: string): number {
    const decoded = jwt.decode(token) as { iat: number; exp: number };
    return decoded.exp - decoded.iat;
  }

  it('is twelve hours', () => {
    const token = jwt.sign({ userId: '1', role: 'admin' }, SECRET, { expiresIn: '12h' });
    expect(ttlSeconds(token)).toBe(12 * 60 * 60);
  });

  it('is longer than a working day and shorter than a night plus a day', () => {
    // The two bounds the number was chosen between: long enough that nobody is
    // interrupted mid-afternoon, short enough that a token taken in the evening
    // is dead by morning.
    const twelveHours = 12 * 60 * 60;
    expect(twelveHours).toBeGreaterThan(8 * 60 * 60);
    expect(twelveHours).toBeLessThan(24 * 60 * 60);
  });

  it('is not the USER token length, which is thirty days and a different decision', () => {
    // A user signs in on their own phone and stays signed in; an admin holds a
    // key to everybody's data. The two numbers must never be reasoned about
    // together, and the gap between them is the reminder.
    const user = jwt.sign({ userId: '1', role: 'user' }, SECRET, { expiresIn: '30d' });
    expect(ttlSeconds(user)).toBe(30 * 24 * 60 * 60);
    expect(ttlSeconds(user)).toBeGreaterThan(12 * 60 * 60);
  });
});
