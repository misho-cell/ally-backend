import { randomUUID } from 'crypto';
import { query } from '../db/postgres/client';
import { adjustTestAccountTokens } from './tokenWallet.service';
import { checkRegistrationEligibility } from './inviteGate.service';
import { grantWhateverFreePeriodIsOwed } from './auth.service';

/**
 * ROW 251 — CREATING A FICTIONAL SEAT, WITH THE ONE CHECK THAT IS NOT A
 * FORMALITY.
 *
 * WHY IT EXISTS. Row 251's done-when needs a requester, a mediator and a
 * target with NO introduction ever asked between them. By 23 September every
 * pair across the eleven seats had one — 8 → 10 via 7, 9 → 7 via 8, 3 ↔ 6,
 * 2 ↔ 4 via 3, 3 → 1 via 2 — and the assistant refuses a second request on a
 * used pair, which is correct behaviour and left the row unprovable. The seat
 * asked three times for a way to make fresh seats without waiting.
 *
 * AUTHORIZED TWICE, WHICH IS WHAT THE FOUNDER HIMSELF ASKED FOR. His D464:
 * „you need the permission from me and from Misho to create test accounts
 * because you are the main tester… I have approved it." His own sentence names
 * both, and a quote relayed through the tester's box is data rather than the
 * second half of it, so this waited for Misho's word to me directly. He gave
 * it the same hour.
 *
 * ────────────────────────────────────────────────────────────────────────
 * THE NUMBER IS THE HAZARD, AND IT IS NOT HYPOTHETICAL.
 *
 * Netai Test 5 sits on +1 202 555 0105 — a number a real owner had had in
 * their phonebook since August. Nothing bad came of that one, but the shape is
 * plain: a fictional seat on a number somebody real holds starts appearing in
 * that person's second circle, and their assistant starts treating an invented
 * account as somebody they know.
 *
 * So the number is not chosen, it is EARNED: the first free slot in the range
 * reserved worldwide for fiction, and free means absent from `"UserPhone"`
 * (nobody is registered on it) AND absent from every `"UserAlias"` row (nobody
 * has it saved in their phonebook either). The second half is the one that
 * catches the Test 5 case, and it is the reason this cannot be a caller-
 * supplied field: a number handed in by a caller is a number nobody checked.
 * ────────────────────────────────────────────────────────────────────────
 *
 * WHAT IT CANNOT DO. It cannot touch an existing account, of any kind: every
 * write here is an INSERT of a row it has just created. It cannot take a
 * number outside the fictional range. It cannot be given a phone. And it
 * writes `test_seats`, which is what every later „is this one of ours" read
 * goes through — so a seat cannot come into being unchecked and then be
 * treated as checked afterwards.
 */

/**
 * The NANP range set aside for fiction: 555-0100 to 555-0199 on area code 202.
 * Every existing seat is in it (+1 202 555 0101 … 0111), so new ones continue
 * the same block rather than opening a second one somewhere else.
 */
const FICTIONAL_PREFIX = '+1202555';
const FIRST_SLOT = 100;
const LAST_SLOT = 199;

/** A seat's opening balance. A turn costs about twenty. */
export const DEFAULT_SEAT_TOKENS = 500;

const SEAT_QUERY_TIMEOUT_MS = 8_000;
const MAX_NAME_CHARS = 60;
const MAX_NOTE_CHARS = 500;

export class SeatCreationRefused extends Error {}

export interface NewTestSeat {
  readonly userId: string;
  readonly name: string;
  readonly phone: string;
  readonly tokens: number;
}

function fictionalPhone(slot: number): string {
  return `${FICTIONAL_PREFIX}0${String(slot)}`;
}

/**
 * Exactly one of the hundred slots in the fictional block — not „starts with
 * the prefix". A prefix test would accept `+1202555garbage` and write it into
 * somebody's phonebook as a contact, and a range reserved for fiction stops
 * protecting anybody the moment the check is sloppier than the range.
 */
export function isFictionalSlot(phone: string): boolean {
  const slot = Number(phone.slice(FICTIONAL_PREFIX.length));
  return (
    phone.startsWith(FICTIONAL_PREFIX) &&
    phone.length === FICTIONAL_PREFIX.length + 4 &&
    /^\d{4}$/.test(phone.slice(FICTIONAL_PREFIX.length)) &&
    slot >= FIRST_SLOT &&
    slot <= LAST_SLOT
  );
}

/**
 * The first slot in the fictional range that nobody is registered on and
 * nobody has saved. Both halves are asked of the live database in one
 * statement, so the answer cannot be stale between the two questions.
 */
export async function firstFreeFictionalPhone(): Promise<string> {
  const candidates: string[] = [];
  for (let slot = FIRST_SLOT; slot <= LAST_SLOT; slot += 1) candidates.push(fictionalPhone(slot));

  const taken = await query<{ phone: string }>(
    `SELECT phone FROM "UserPhone" WHERE phone = ANY($1)
     UNION
     SELECT phone FROM "UserAlias" WHERE phone = ANY($1)
     UNION
     SELECT phone FROM test_seats WHERE phone = ANY($1)`,
    [candidates],
    SEAT_QUERY_TIMEOUT_MS,
  );
  const used = new Set(taken.rows.map((r) => r.phone));
  const free = candidates.find((p) => !used.has(p));
  if (free === undefined) {
    throw new SeatCreationRefused(
      `no free number left in ${FICTIONAL_PREFIX}0${FIRST_SLOT}–${LAST_SLOT} — every one is registered or saved in somebody's phonebook`,
    );
  }
  return free;
}

/**
 * Create one fictional seat, optionally with contacts in its phonebook.
 *
 * `holds` are the phones this seat will have SAVED — the direction matters and
 * is the whole reason the caller says it: row 251 needs a requester who holds
 * a mediator who holds a target, and the requester NOT holding the target.
 * Each entry must already be a seat, so this can never put a real person into
 * a fictional account's phonebook.
 *
 * Not a transaction, deliberately, and the order is the argument: the account
 * exists before anything points at it, and a failure half way leaves a seat
 * with fewer contacts than asked for — which the caller can see and repeat —
 * rather than an alias row pointing at an account that does not exist.
 */
/**
 * A SEAT SHAPED LIKE AN OLD ALLY ACCOUNT, so the login gate can be proven on a
 * fiction before it ever meets a person.
 *
 * The founder's rule (24 September): an old Ally account cannot enter Netai by
 * logging in — it needs an invitation from somebody already here. That is a
 * gate on ACCESS, and a login gate nobody has tested is the worst possible
 * thing to release at 62,163 people.
 *
 * An ordinary seat cannot stand in for one: it is built to be a WORKING Netai
 * user, with `hasAccessToAlly` true and a year of subscription. This variant is
 * the opposite on exactly the columns the gate reads, and nothing else changes
 * — the same fictional number range, the same `test_seats` row, the same
 * refusals.
 *
 * ⚠️ AND THE COLUMN IS NOT THE DEFINITION. `hasAccessToAlly = false` matches
 * 62,163 accounts that have never opened Netai AND 35 that use it daily,
 * Lika Ose among them with 321 threads — it is the admin-login flag, not
 * „did you come from Netai". The gate keys on having NO Netai activity at all.
 * This seat therefore has no threads, which is what actually puts it in the
 * gated population, and the flag is set false only so it resembles the real
 * thing in every column somebody might later read.
 *
 * ⚠️ AND THE FIRST VERSION COULD NOT BE CREATED AT ALL. It set
 * `subscription_tier` to NULL, on the reasoning that a legacy account has no
 * subscription — and the column is NOT NULL, so every attempt died with a 500.
 * It shipped with tests that passed, because the tests mock the database and a
 * mock has no constraints. **Built, deployed, and never once run**, which is
 * the third fact this project keeps having to add to the other two: §34 said
 * the login gate would be proven on this seat before anybody turned it on, and
 * the seat could not exist.
 *
 * The values are now MEASURED rather than reasoned. What 62,156 real legacy
 * accounts actually carry:
 *
 *     subscription_tier   'free'        subscription_status   'inactive'
 *
 * (Of the rest: 5 premium/active, 1 premium/trialing, 1 pro/active — real
 * people with real subscriptions who have never opened Netai. They are not
 * what this fiction imitates.)
 */
export interface SeatShape {
  /** Default false: an ordinary seat is a working Netai user. */
  readonly legacyAlly?: boolean;
  /**
   * A SEAT THAT ARRIVED THROUGH SOMEBODY'S INVITATION — the user id of the seat
   * that invited it.
   *
   * Why it exists: the free days an invitation carries (D485) fire on the
   * REGISTRATION path, and this route does not register — it inserts an
   * account. The tester said so plainly on 24 September: „our only way to make
   * a fictional account writes the account directly; it does not go through
   * registration and takes no inviter. So from our side there is no invited
   * fictional registration to make." They were right, and a feature that spends
   * money cannot be left unprovable.
   *
   * ⚠️ IT REUSES THE REAL CODE, and that is the whole point. The inviter is
   * resolved by the product's own `checkRegistrationEligibility`, and the
   * period is granted by the same `grantWhateverFreePeriodIsOwed` that
   * `registerUser` calls. A copy of those rules here would agree with itself
   * and prove nothing.
   *
   * What is skipped is the OTP, and only the OTP: it proves possession of a
   * phone, which a fictional number has nobody to prove. No door is opened —
   * this route was already able to create accounts, and could not before.
   */
  readonly invitedBy?: string;
}

/**
 * Put this brand-new seat through the INVITATION half of registration: resolve
 * the inviter with the product's own gate, record the link the way
 * `registerUser` records it, and hand the result to the same grant function.
 *
 * Nothing about the rules lives here. This function's only job is to ask the
 * real ones the same question a real registration asks, so that „an invited
 * person gets N free days" can be observed rather than believed.
 *
 * The inviter must itself be a seat. A fictional account invited by a REAL
 * person would put a fiction into that person's referral chain and their
 * earnings, which is a write on somebody's data, not a test.
 */
/**
 * ⚠️ ASKED BEFORE ANYTHING IS CREATED, and it was not, first time round.
 *
 * The refusal used to live inside `arriveByInvitation`, which runs AFTER the
 * account, its phone and its `test_seats` row are written. So the very first
 * live refusal — `invited_by: 501`, a real person, correctly rejected — left
 * Netai Test 22 (172267) behind: a seat nobody asked for, made by a call that
 * failed. A refusal that has already created something has not refused.
 *
 * It is cheap and depends on nothing about the new account, so there is no
 * reason for it to happen late other than not having thought about it.
 */
export async function inviterSeatPhone(inviterSeatId: string): Promise<string> {
  const inviter = await query<{ phone: string }>(
    `SELECT up.phone
       FROM test_seats ts
       JOIN "UserPhone" up ON up."userId" = ts.user_id
      WHERE ts.user_id = $1::int
      LIMIT 1`,
    [inviterSeatId],
    SEAT_QUERY_TIMEOUT_MS,
  );
  const inviterPhone = inviter.rows[0]?.phone;
  if (inviterPhone === undefined) {
    throw new SeatCreationRefused(
      `the inviter ${inviterSeatId} is not a test seat — a fictional account may only be invited by another seat`,
    );
  }
  return inviterPhone;
}

/**
 * A SEAT'S OWN REFERRAL CODE, RESOLVED SERVER-SIDE AND NEVER RETURNED.
 *
 * The tester, 24 September: „we could not repeat the code-branch pass — the
 * admin user read shows no referral code to type in." Correct, and it should
 * not: **a referral code is a credential** (D149), and an admin page that
 * printed them would print real people's along with the fictions'.
 *
 * So the code never leaves the server. The caller names a SEAT and the gate is
 * asked with that seat's code, which lets the code branch be exercised by
 * somebody who never sees a code. The seat requirement is the same one as
 * everywhere else here: only a fiction may stand in for an inviter.
 */
export async function inviterSeatReferralCode(inviterSeatId: string): Promise<string> {
  const row = await query<{ referral_code: string | null }>(
    `SELECT u.referral_code
       FROM test_seats ts
       JOIN "User" u ON u.id = ts.user_id
      WHERE ts.user_id = $1::int
      LIMIT 1`,
    [inviterSeatId],
    SEAT_QUERY_TIMEOUT_MS,
  );
  if (row.rowCount === 0) {
    throw new SeatCreationRefused(
      `${inviterSeatId} is not a test seat — only a fiction may stand in for an inviter`,
    );
  }
  const code = row.rows[0].referral_code;
  if (!code) {
    /**
     * Said out loud rather than falling through. A missing code would make the
     * gate answer „referral_required" — which looks exactly like the code
     * branch REFUSING, when in fact nothing was ever asked of it.
     */
    throw new SeatCreationRefused(
      `seat ${inviterSeatId} has no referral code yet, so the code branch cannot be tested with it — pick another seat`,
    );
  }
  return code;
}

async function arriveByInvitation(
  userId: string,
  phone: string,
  inviterSeatId: string,
  inviterPhone: string,
): Promise<void> {
  const gate = await checkRegistrationEligibility(phone, inviterPhone);

  /**
   * The link, written exactly as `registerUser` writes it. Left out, the
   * account would carry free days with nothing saying where they came from,
   * and the tester's „read the inviter link" would have nothing to read.
   */
  await query(
    `UPDATE "User" SET "inviterReferralUserId" = $2, "updatedAt" = NOW() WHERE id = $1::int`,
    [userId, gate.inviterUserId ?? null],
    SEAT_QUERY_TIMEOUT_MS,
  );

  await grantWhateverFreePeriodIsOwed(Number(userId), phone, gate);

  // eslint-disable-next-line no-console
  console.log(
    `[test-seat] ${userId} arrived by invitation from ${inviterSeatId}; gate mode ${gate.mode ?? 'none'}, inviter ${gate.inviterUserId ?? 'not resolved'}`,
  );
}

export async function createTestSeat(
  name: string,
  holds: readonly string[],
  tokens: number,
  createdBy: string,
  note: string,
  shape: SeatShape = {},
): Promise<NewTestSeat> {
  const seatName = name.trim().slice(0, MAX_NAME_CHARS);
  if (seatName === '') throw new SeatCreationRefused('a seat needs a name');
  const why = note.trim().slice(0, MAX_NOTE_CHARS);
  if (why.length < 3) throw new SeatCreationRefused('say why this seat is being made');

  /**
   * BEFORE A SINGLE ROW EXISTS. Everything that can refuse is asked here, and
   * the writing below cannot say no to anything.
   *
   * The inviter moved up yesterday, after a correct refusal of `invited_by`
   * left Netai Test 22 behind. THE PHONEBOOK DID NOT, and the tester found
   * that today: `holds` the route would not accept produced Netai Test 42
   * twice — 172531 and 172532, six seconds apart — because the check lived
   * after the same three INSERTs.
   *
   * One fixed, one missed, in a file I had just edited for exactly this. The
   * rule is the block, not the line: a refusal that can still be reached below
   * this point is the same bug again.
   */
  const inviterPhone =
    shape.invitedBy === undefined ? null : await inviterSeatPhone(shape.invitedBy);
  const phonebook = await resolvePhonebook(holds);

  const phone = await firstFreeFictionalPhone();

  /**
   * The same shape as the eleven that exist — and I wrote that sentence the
   * first time round while doing the opposite.
   *
   * The first version set `subscription_tier`, `subscription_status` and
   * `hasAccessToAlly`, because those are the columns the words „is this
   * account active" bring to mind. All three seats came out with
   * `current_period_ends_at` NULL, and the seat found it within twenty
   * minutes: every one of them got 403 `subscription_required` on
   * `POST /threads`. They could be read, they had tokens, they were Netai
   * users — and they could not open a chat, so row 251 could not start.
   *
   * `hasActiveSubscription` is the gate and it reads the PERIOD END, not the
   * status: „active" means `current_period_ends_at !== null && > now`. Netai
   * Test 8 carries its creation date plus one year, and so does every other
   * seat. I checked the columns I was thinking about and not the one beside
   * them — the third time in a week, after the `::text` cast and the sweep
   * exclusion.
   *
   * A YEAR, matching the eleven exactly, so a seat and a seat behave the same.
   * The test beside this does not match this string: it feeds the row this
   * INSERT produces to `hasActiveSubscription` itself, because what matters is
   * not which columns are named here but whether the product's own gate opens.
   */
  const created = await query<{ id: number }>(
    `INSERT INTO "User" (name, password, status, subscription_tier, subscription_status,
                         "hasAccessToAlly", current_period_ends_at)
     VALUES ($1, '', 'ACTIVE',
             CASE WHEN $2 THEN 'free'     ELSE 'pro'    END,
             CASE WHEN $2 THEN 'inactive' ELSE 'active' END,
             NOT $2,
             CASE WHEN $2 THEN NULL       ELSE NOW() + INTERVAL '1 year' END)
     RETURNING id`,
    [seatName, shape.legacyAlly === true],
    SEAT_QUERY_TIMEOUT_MS,
  );
  const userId = String(created.rows[0].id);

  await query(
    `INSERT INTO "UserPhone" (phone, "phoneNumber", "phoneCode", "userId", "createdAt", "updatedAt")
     VALUES ($1, $2, '+1', $3, NOW(), NOW())`,
    [phone, phone.slice(2), Number(userId)],
    SEAT_QUERY_TIMEOUT_MS,
  );

  await query(
    `INSERT INTO test_seats (user_id, name, phone, created_by, note)
     VALUES ($1::int, $2, $3, $4, $5)`,
    [userId, seatName, phone, createdBy, why],
    SEAT_QUERY_TIMEOUT_MS,
  );

  if (shape.invitedBy !== undefined && inviterPhone !== null)
    await arriveByInvitation(userId, phone, shape.invitedBy, inviterPhone);

  const saved = await savePhonebook(userId, phonebook);
  const balance =
    tokens === 0
      ? 0
      : await adjustTestAccountTokens(
          userId,
          tokens,
          `new test seat: ${why}`,
          `seat:${randomUUID()}`,
        );

  // eslint-disable-next-line no-console
  console.log(
    `[test-seat] ${createdBy} created ${seatName} (${userId}) on a free fictional number, ${saved} contact(s), ${balance} token(s) — ${why}`,
  );
  return { userId, name: seatName, phone, tokens: balance };
}

/**
 * Put contacts into the new seat's phonebook — SEATS ONLY.
 *
 * A phone that is not itself a recorded seat is refused rather than skipped:
 * silently dropping it would leave the caller believing in an edge that does
 * not exist, and row 251 is entirely about which edges exist.
 */
/**
 * ⚠️ 25 SEPTEMBER — A REFUSAL CREATED TWO ACCOUNTS, AND I HAD ALREADY FIXED
 * THIS ONCE.
 *
 * Yesterday a seat route refused `invited_by: 501` correctly and AFTER writing
 * the account, the phone and the `test_seats` row — leaving Netai Test 22
 * behind. I moved that check above the INSERT, verified thirty seats before
 * and thirty after, and wrote it up as fixed.
 *
 * It was not fixed. It was the INSTANCE fixed, and the class left standing.
 * Today the tester passed `holds` the route would not accept and got
 * **Netai Test 42 twice**, ids 172531 and 172532, six seconds apart — because
 * `savePhonebook` ran after the same three writes and threw from there.
 *
 * So the phonebook is RESOLVED first and WRITTEN second, and the resolve is
 * pure: it reads, it decides, it refuses, and it touches nothing. The caller
 * runs it before any INSERT.
 */
async function resolvePhonebook(holds: readonly string[]): Promise<ReadonlyMap<string, string>> {
  if (holds.length === 0) return new Map();

  const known = await query<{ phone: string; name: string }>(
    `SELECT up.phone, u.name
       FROM "UserPhone" up
       JOIN "User" u ON u.id = up."userId"
      WHERE up.phone = ANY($1)
        AND (EXISTS (SELECT 1 FROM test_seats ts WHERE ts.user_id = up."userId")
             OR up.phone LIKE '${FICTIONAL_PREFIX}%')`,
    [[...holds]],
    SEAT_QUERY_TIMEOUT_MS,
  );
  const byPhone = new Map(known.rows.map((r) => [r.phone, r.name]));

  /**
   * A FICTIONAL NUMBER NOBODY IS REGISTERED ON may also be held, and it is the
   * only way one door can be tested at all.
   *
   * Social proof admits a registrant whose number enough OTHER people already
   * have saved. To see it refused — or admitted — somebody has to be holding a
   * number that is not yet an account, because the whole point of that door is
   * the person who has NOT registered yet. Every seat's number is registered by
   * definition, so without this the door cannot be reached from here and „we
   * accept the unit tests" is as far as it goes.
   *
   * ⚠️ THE SAFETY PROPERTY IS UNCHANGED, and it is the one that matters: a
   * REAL person's number can still never enter a fictional account's
   * phonebook. The number must be inside the range reserved worldwide for
   * fiction AND registered to nobody. Anything else is still refused by name.
   */
  const unregisteredFiction = holds.filter((p) => !byPhone.has(p) && isFictionalSlot(p));
  for (const phone of unregisteredFiction) {
    byPhone.set(phone, `Fiction ${phone.slice(-4)}`);
  }

  const missing = holds.filter((p) => !byPhone.has(p));
  if (missing.length > 0) {
    throw new SeatCreationRefused(
      `these are not test seats and will not be put into a seat's phonebook: ${missing.join(', ')}`,
    );
  }

  return byPhone;
}

/** The writing half. Nothing here can refuse — every decision is already made. */
async function savePhonebook(
  userId: string,
  resolved: ReadonlyMap<string, string>,
): Promise<number> {
  for (const [phone, contactName] of resolved) {
    await query(
      `INSERT INTO "UserAlias" ("contactId", phone, alias)
       VALUES ($1::int, $2, $3)`,
      [userId, phone, contactName],
      SEAT_QUERY_TIMEOUT_MS,
    );
  }
  return resolved.size;
}

/**
 * Is this id a seat the admin routes may operate — the eleven in source, or
 * one this route created?
 *
 * SEPARATE FROM `isFictionalTestAccount`, AND THAT IS DELIBERATE. That one is
 * a lookup in a hardcoded Set with no I/O, and a comment in `mcp/handlers.ts`
 * leans on exactly that: the inbox marks a counterpart fictional by its
 * absence-means-something rule, which only holds while the check „has no
 * failure mode". Giving it a query would quietly turn „I could not look" into
 * „there is nobody there", which is the confusion this whole project has spent
 * a week hunting.
 *
 * So the cosmetic marker keeps the Set and a newly created seat is not marked
 * in the inbox until its id is added to that list in source — one line, in the
 * commit that follows its creation. The OPERATING routes use this instead, and
 * this one may fail: it throws rather than returning false, because „I cannot
 * read the list" must not look like „this is not a test account".
 */
export async function isOperableTestSeat(
  userId: string,
  inSource: (id: string) => boolean,
): Promise<boolean> {
  const id = userId.trim();
  if (inSource(id)) return true;
  if (!/^\d+$/.test(id)) return false;
  const row = await query<{ user_id: number }>(
    `SELECT user_id FROM test_seats WHERE user_id = $1::int LIMIT 1`,
    [id],
    SEAT_QUERY_TIMEOUT_MS,
  );
  return row.rows.length > 0;
}

/** Every seat this route has made, for a listing beside the hardcoded eleven. */
export async function createdTestSeats(): Promise<{ userId: string; name: string }[]> {
  const rows = await query<{ user_id: number; name: string }>(
    `SELECT user_id, name FROM test_seats ORDER BY user_id`,
    [],
    SEAT_QUERY_TIMEOUT_MS,
  );
  return rows.rows.map((r) => ({ userId: String(r.user_id), name: r.name }));
}

/**
 * „This account belongs to nobody" — the one definition, in SQL.
 *
 * WHY IT IS A FRAGMENT AND NOT A JOIN EVERY CALLER WRITES. Since the seat
 * route shipped, „is this fictional" has had two homes: a hardcoded Set in
 * source, which SQL cannot see, and this table. The eleven were backfilled on
 * 23 September so the table is now the whole truth, and this is the one place
 * the question is phrased.
 *
 * WHAT IT COST BEFORE ANYBODY NOTICED, measured the same afternoon:
 *
 *     accounts with an ACTIVE subscription        41
 *       of them fictional seats                   20     ← 49%
 *
 * Half of every pool, count and ranking built on „active" belonged to nobody,
 * and it grew by one each time a seat was made.
 *
 * NOT AN ID RANGE AND NOT A PHONE PREFIX, and that is the whole care in it.
 * „171870 to 171941" reads as the eleven and CONTAINS 171903 — a real person's
 * account, inside the range only because of when it was created. A filter on
 * the range would have removed a human being from the product, silently. The
 * +1202555 prefix is the same mistake in better clothes: true of every seat,
 * and still a property the data happens to have rather than a list anybody
 * wrote.
 *
 * The argument is a column name written in this codebase, never anything a
 * caller supplies — the same shape as `RESPONDER_COND` in
 * `introduction.service`.
 */
export function notATestSeat(userIdColumn: string): string {
  return `NOT EXISTS (SELECT 1 FROM test_seats ts WHERE ts.user_id = ${userIdColumn})`;
}
