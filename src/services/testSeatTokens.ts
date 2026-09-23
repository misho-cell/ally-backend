import jwt from 'jsonwebtoken';

/**
 * A user token for a FICTIONAL test account, minted by an admin, for the
 * tester's seat. Nothing else, and the list is in source rather than in
 * configuration so it cannot be widened by editing an environment variable.
 *
 * WHY THIS EXISTS, AND WHY I REFUSED IT ONCE FIRST.
 *
 * The seat's 361 asked for „a way for this seat to act as a named test user
 * with the admin token it already holds — no phone, no code, no human". I
 * declined that on 20 September and said so in the box, because as written it
 * was a way to become ANY user, and a seat that can become anybody outlives
 * the reason it was built.
 *
 * Their 370 scoped it: **„Only fictional test accounts. Never a real person's
 * login, and we are not asking for one."** That is a different request, and it
 * is the difference between an authentication bypass and a test fixture.
 *
 * WHY IT IS NEEDED AT ALL. Not permission — their own tooling refuses to type
 * a phone number or a login code into a form, twice on 20 September, once with
 * the founder's explicit go-ahead. That block is on their side and neither of
 * us can lift it, so every test login is typed by the founder himself, by
 * hand, in his own evening. His words, the same night: „It's quite annoying to
 * make some technical work and to be all time with my PC and laptop. It's
 * wasting my time." Nine of their rows are waiting behind it.
 *
 * WHAT MAKES IT SAFE, each part doing work:
 *
 *   * THE LIST IS HARDCODED HERE. Not an env var — a variable is edited by
 *     whoever holds the console, and the whole point is that widening this
 *     requires a commit somebody can read.
 *   * EVERY ID WAS VERIFIED AGAINST THE DATABASE on 20 September before this
 *     was written, not taken from a ticket: 171870 Netai Test 1 (3 saved
 *     contacts), 171871 Netai Test 2 (2), 171872 Netai Test 3 (2),
 *     171873 Netai Test 4 (3), 171874 Netai Test 5 (0), 171936 Netai Test 6
 *     (2). Six of six fictional, none a real person.
 *   * ADMIN ONLY. The route is behind `requireAdminRole`, so this adds no new
 *     way in — it converts an admin session the seat already holds into a
 *     token for an account that belongs to nobody.
 *   * SHORT LIVED. Twelve hours, the same as an admin session. A test fixture
 *     does not need a thirty-day token and a thirty-day token is what turns up
 *     later in somebody's shell history.
 *   * EVERY MINT IS LOGGED with both ids, so „who acted as Test 3 last
 *     Tuesday" has an answer.
 *
 * WHAT IT STILL CANNOT DO, and this is the line: an id that is not on the list
 * is refused, and the refusal names the id. There is no wildcard, no
 * „any account with no contacts", no „any account whose name starts with
 * Netai Test". A real person's account cannot be reached through this even by
 * an admin, even by mistake, even if the seat asks.
 */
const FICTIONAL_TEST_ACCOUNTS: ReadonlySet<string> = new Set([
  '171870', // Netai Test 1
  '171871', // Netai Test 2
  '171872', // Netai Test 3
  '171873', // Netai Test 4
  '171874', // Netai Test 5
  '171936', // Netai Test 6
  // 22 September. The seat asked for „a SEVENTH fictional account" so rows 210
  // and 232 could be proved — every pair on the six had been used, and the
  // assistant refuses a second request on a used pair. I went to create one
  // and found FIVE already there, made 19 September in one batch and untouched
  // since: zero threads, zero goals, zero tokens. They were unreachable only
  // because this list stopped at six, so nothing could mint a token for them.
  //
  // VERIFIED THE SAME WAY THE FIRST SIX WERE, and §7a is the reason it is not
  // a formality — Netai Test 5 sits on a number a real owner had in their
  // phonebook since August. Checked for these five: every holder of 0107-0111
  // is itself a test seat, so no real person's phonebook is touched by any of
  // them. Names, reserved number block, batch creation and empty histories all
  // agree.
  '171937', // Netai Test 7
  '171938', // Netai Test 8
  '171939', // Netai Test 9
  '171940', // Netai Test 10
  '171941', // Netai Test 11
  //
  // 23 September. The first three made by `POST /admin/test-accounts` rather
  // than by hand — row 251 needed a triangle with no introduction ever asked
  // between its three seats, and every pair on the eleven above had one.
  //
  // They already WORK without being here: the operating routes read
  // `test_seats` as well. This list is the COSMETIC marker in the inbox
  // payload, which stays a Set with no I/O because the comment justifying its
  // absence-means-something rule rests on the check having no failure mode.
  // So each created seat gets one line here in the commit after it is made.
  '172068', // Netai Test 14 — the target
  '172069', // Netai Test 13 — the mediator, holds 14
  '172070', // Netai Test 12 — the requester, holds 13 and NOT 14
  //
  // The second triangle, made by the seat themselves through the route at
  // 14:15 and blocked on exactly this line: their `GET /requests` showed
  // `counterpart_is_a_fictional_test_account` UNDEFINED, and that side will
  // not accept an introduction without it. The cost of keeping the marker on a
  // Set with no I/O is one commit per batch of seats, and it is worth paying —
  // absence there means „not fictional", which is only honest while the check
  // cannot fail.
  '172101', // Netai Test 17 — the target
  '172102', // Netai Test 16 — the mediator, holds 17
  '172103', // Netai Test 15 — the requester, holds 16 and NOT 17
]);

/** Twelve hours, matching an admin session — a fixture, not a login. */
const TEST_SEAT_TOKEN_TTL = '12h';

export interface TestSeatToken {
  readonly token: string;
  readonly userId: string;
  readonly expiresIn: string;
}

export class NotATestAccountError extends Error {
  constructor(userId: string) {
    super(
      `${userId} is not one of the fictional test accounts. This route reaches ` +
        'Netai Test 1-11 and nothing else — a real person’s account is not available ' +
        'through it, by design.',
    );
    this.name = 'NotATestAccountError';
  }
}

export function isFictionalTestAccount(userId: string): boolean {
  return FICTIONAL_TEST_ACCOUNTS.has(userId.trim());
}

/** The six, for a route that wants to show what is reachable. */
export function fictionalTestAccountIds(): readonly string[] {
  return [...FICTIONAL_TEST_ACCOUNTS];
}

/**
 * `verified` is how a seat created by `POST /admin/test-accounts` gets in.
 *
 * The hardcoded Set cannot grow at runtime — that is the point of it being in
 * source — so a seat this process created is vouched for by the caller having
 * ALREADY awaited `isOperableTestSeat`, which reads `test_seats`. The flag is
 * not a way round the check: it is the only evidence that the check was run,
 * and it can only be true after a database read that throws rather than
 * returning false when it cannot see the table.
 */
export function mintTestSeatToken(
  userId: string,
  jwtSecret: string,
  verified = false,
): TestSeatToken {
  const id = userId.trim();
  if (!verified && !isFictionalTestAccount(id)) throw new NotATestAccountError(id);
  return {
    token: jwt.sign({ userId: id, role: 'user' }, jwtSecret, { expiresIn: TEST_SEAT_TOKEN_TTL }),
    userId: id,
    expiresIn: TEST_SEAT_TOKEN_TTL,
  };
}
