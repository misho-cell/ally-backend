import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * ⚠️ AN ANSWERED INTRODUCTION STILL HAD ITS BUTTONS — the tester, seat
 * Netai Test 4, 25 September.
 *
 * Two cards from 23 September, both already answered — their own text says
 * „I have given … contact" — still offering Connect / Keep it / Decline /
 * Remind me later. Pressing „Remind me later" answered
 *
 *   409  „ამ მოთხოვნაზე უკვე გაქვს პასუხი"
 *
 * The founder's standing rule is that after an answer, zero buttons remain,
 * and the tester's call on which half to build was the SERVER's: an answered
 * request leaves the waiting list.
 *
 * `GET /requests` was never the problem — it filters `status = 'pending'` and
 * always did. The card is a `pending_updates` row of kind `intro_request`, and
 * NOTHING retired that row when the request was answered. Every other kind in
 * that queue has such a path; the release query's own comment says it out loud
 * about a goal's question — „both paths delete the held row" — and this kind
 * was simply never given one.
 *
 * AND IT WAS NOT ONLY BUTTONS. A held row is counted by `countHeldUpdates`,
 * which is the „კიდევ 6 განახლება გელოდება" line a real person read on her
 * phone this morning and could not make sense of. An answered request was
 * padding that number.
 */
const src = (...p: string[]): string => readFileSync(join(__dirname, '..', ...p), 'utf8');

const intro = src('introduction.service.ts');
const updates = src('pendingUpdates.service.ts');

describe('the answer retires the card', () => {
  it('deletes the intro card for that request when the request is answered', () => {
    expect(intro).toContain('async function dropIntroCard');
    expect(intro).toContain('DELETE FROM pending_updates');
    expect(intro).toContain("kind = 'intro_request'");
    expect(intro).toContain("payload->>'request_id' = $2::text");
  });

  /** Scoped to the person answering — never „every card for this request". */
  it('touches only the answering mediator’s own row', () => {
    const fn = intro.slice(intro.indexOf('async function dropIntroCard'));
    const body = fn.slice(0, fn.indexOf('export async function resolveIntroductionRequest'));

    expect(body).toContain('WHERE user_id = $1');
  });

  it('runs on the resolve path, after the request is actually updated', () => {
    const resolve = intro.slice(intro.indexOf('export async function resolveIntroductionRequest'));
    const conflict = resolve.indexOf(
      "return { ok: false, code: 'conflict', error: ERR_ALREADY_ANSWERED };",
    );
    const drop = resolve.indexOf('await dropIntroCard(');

    expect(drop).toBeGreaterThan(conflict);
  });

  /**
   * An introduction that was accepted must not fail because a card could not
   * be tidied away. The stale card is the smaller harm — and the read-side
   * guard catches whatever this misses.
   */
  it('never lets the tidy-up break the accept', () => {
    const fn = intro.slice(intro.indexOf('async function dropIntroCard'));

    expect(fn.slice(0, 900)).toContain('catch (error)');
    expect(fn.slice(0, 900)).toContain('could not retire its card');
  });
});

describe('the rows already stranded, which nothing written today can reach', () => {
  /**
   * Test 4's two cards are from 23 September. Code that retires a row AT
   * ANSWER TIME can never go back and collect them, and neither can it help
   * the next surface that answers a request without knowing this row exists.
   * So the read side refuses them too.
   */
  it('will not release an intro card whose request is no longer pending', () => {
    const release = updates.slice(updates.indexOf('WITH due AS'), updates.indexOf('chosen AS'));

    expect(release).toContain("p.kind <> 'intro_request' OR EXISTS");
    expect(release).toContain('FROM introduction_requests ir');
    expect(release).toContain("ir.status = 'pending'");
  });

  /**
   * „N more updates are waiting" must not count something already answered.
   *
   * ⚠️ This used to slice from `countHeldUpdates` and look for the clause
   * inside it. On 25 September row 250 gave that line a BREAKDOWN by kind,
   * and the two queries were made to share their WHERE clause literally so a
   * count and its own breakdown could never disagree — which moved the clause
   * above the function and failed this test.
   *
   * The property did not change; the assertion had to follow it, and it is
   * stronger now: the guard is asserted once, and BOTH readers are asserted
   * to use the same constant.
   */
  it('does not count one in the more-coming line either', () => {
    expect(updates).toContain('const HELD_AND_STILL_REAL = `');
    const shared = updates.slice(updates.indexOf('const HELD_AND_STILL_REAL = `'));

    expect(shared.slice(0, 1200)).toContain("p.kind <> 'intro_request' OR EXISTS");
  });

  /** One clause, both readers — the „due/held" disagreement cannot come back. */
  it('counts and groups the same rows, from the same clause', () => {
    const counter = updates.slice(updates.indexOf('export async function countHeldUpdates'));
    const grouper = updates.slice(updates.indexOf('export async function heldUpdatesByKind'));

    expect(counter.slice(0, 400)).toContain('${HELD_AND_STILL_REAL}');
    expect(grouper.slice(0, 400)).toContain('${HELD_AND_STILL_REAL}');
  });

  /**
   * Compared as text rather than cast to int. The payload is written by us and
   * carries a number today; a cast is a query that throws on the day it stops
   * being one, and this query serves every update for every person.
   */
  it('compares the id as text, so a bad payload cannot throw the whole read', () => {
    expect(updates).toContain("ir.id::text = p.payload->>'request_id'");
    expect(updates).not.toContain("(p.payload->>'request_id')::int");
  });

  /**
   * ⚠️ THE FIRST VERSION OF THAT COMMENT ENDED THE STRING IT WAS INSIDE.
   *
   * This SQL lives in a JS template literal and the comment named
   * resolveIntroductionRequest in backticks, which closed the literal. Caught
   * by the compiler, and it is the same shape as the semicolon in a `--`
   * comment that got two ops reads refused this morning: prose inside a
   * delimiter is still inside the delimiter.
   */
  it('keeps backticks out of the SQL that lives in a template literal', () => {
    const sql = updates.slice(updates.indexOf('WITH due AS'), updates.indexOf('chosen AS'));

    expect(sql).not.toContain('`');
  });
});

/**
 * ⚠️ AND THE FIX ABOVE WAS NOT THE ONE THE TESTER WAS LOOKING AT.
 *
 * I read „answered card still has buttons", found the `intro_request` row in
 * `pending_updates`, and shipped for it before checking. Test 4 has NOT ONE
 * such row and never did. What it has is SEVEN threads linked to an
 * introduction request, all seven `accepted`, all seven still handed a
 * `request_ref` by the thread list — including exactly the two the tester
 * named, „Netai Test 3 → Netai Test 6" and „Netai Test 6 → Netai Test 3".
 *
 * The client draws Connect / Keep it / Decline / Remind me later when a thread
 * carries that ref. It is the ref, not the queue.
 *
 * The other fix stands on its own — an answered request has no business in the
 * update queue or in the „N more updates" count — but two places can both be
 * wrong, and being right about one of them is not the same as having found the
 * bug. That is the whole of what went wrong here, and it went wrong fast
 * because the diagnosis felt finished.
 */
describe('the ref the client draws buttons from', () => {
  const threads = src('threads.service.ts');

  it('is withheld once the request has been answered', () => {
    expect(threads).toContain('REF_ONLY_WHILE_IT_STILL_NEEDS_AN_ANSWER');
    expect(threads).toContain("WHEN ir.status = 'pending' THEN ir.request_ref");
    expect(threads).toContain('${REF_ONLY_WHILE_IT_STILL_NEEDS_AN_ANSWER} AS request_ref');
  });

  /**
   * The bare column would hand the ref out again, and this list is shared by
   * the page query and the open-goals query so one leak covers both.
   */
  it('no longer selects the bare column anywhere', () => {
    expect(threads).not.toContain('       ir.request_ref,');
  });

  /**
   * Derived at read time rather than written back, exactly as the status
   * columns beside it are: correcting the stored rows would be a write across
   * live data and somebody else's to authorise, while deriving it needs nobody
   * and fixes every existing thread at once — including the two from 23
   * September that no forward-only fix could ever reach.
   */
  it('leaves the thread and its conversation alone', () => {
    const column = threads.slice(
      threads.indexOf('const REF_ONLY_WHILE_IT_STILL_NEEDS_AN_ANSWER'),
      threads.indexOf('const THREAD_LIST_COLUMNS'),
    );

    expect(column).not.toMatch(/UPDATE|DELETE/);
  });
});
