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

  /** „N more updates are waiting" must not count something already answered. */
  it('does not count one in the more-coming line either', () => {
    const counter = updates.slice(updates.indexOf('export async function countHeldUpdates'));

    expect(counter.slice(0, 1200)).toContain("p.kind <> 'intro_request' OR EXISTS");
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
