import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * `slow.sh --ready` DECIDES WHETHER A LATENCY MEASUREMENT MAY BE TAKEN, and on
 * 24 September it got that decision wrong in two separate ways within a minute
 * of each other.
 *
 *   1. It said READY over days whose CALLERS had been replaced — the largest
 *      real network in the product on one side of the deploy, ten fresh test
 *      seats on the other. `search_second_degree` walks a network, so its cost
 *      belongs to the caller; that comparison measures the difference between
 *      two people and reads as a fourfold speed-up.
 *
 *   2. When the population check was added, the screen said NOT COMPARABLE in
 *      capital letters and the script exited 0 — because the READY path had
 *      always fallen off the end of the Python block. Every caller of this
 *      gate reads the exit code, by the contract in its own header.
 *
 * The second is the worse one. A gate whose printed answer and returned answer
 * disagree is worse than no gate, and it is the same shape as `quiet.sh | tail`
 * two days earlier: a verdict thrown away by the plumbing.
 *
 * Both are pinned from the source, because a shell script reaching a live
 * read-only endpoint cannot be exercised here.
 */
const slow = readFileSync(join(__dirname, '..', '..', '..', 'scripts', 'ops', 'slow.sh'), 'utf8');

describe('the gate returns the answer it prints', () => {
  it('leaves with the verdict rather than falling off the end', () => {
    expect(slow).toContain('raise SystemExit(VERDICT[0])');
  });

  /**
   * FOUR ANSWERS, NOT THREE. „Enough calls, but not by the same people" is not
   * NOT YET (which says go and get more traffic) and not READY. Collapsing it
   * into either is how the wrong one gets acted on.
   */
  it('documents a fourth exit code for a comparison that cannot be made', () => {
    const header = slow.slice(0, slow.indexOf('READY_PY='));

    expect(header).toMatch(/0\s+READY/);
    expect(header).toMatch(/1\s+NOT YET/);
    expect(header).toMatch(/2\s+COULD NOT READ/);
    expect(header).toMatch(/3\s+NOT COMPARABLE/);
    expect(slow).toContain('VERDICT[0] = 3 if changed else 0');
  });

  it('never prints the bare word READY when the population changed', () => {
    expect(slow).toContain('READY BY VOLUME, NOT COMPARABLE');
  });
});

describe('the population travels with the numbers', () => {
  /**
   * The columns are in the SELECT, so a reader who ignores the verdict still
   * cannot miss that 16 September was one real account and 23 September was
   * eighteen accounts, 97% of them seats.
   */
  it('asks the database who made the calls, not only how many', () => {
    const ready = slow.slice(slow.indexOf('--ready'), slow.indexOf('SINCE='));

    expect(ready).toContain('AS accounts');
    expect(ready).toContain('AS top_user');
    expect(ready).toContain('AS seat_calls');
    expect(ready).toContain('FROM test_seats');
  });

  /**
   * AND THE RATIO IS NOT ALLOWED TO STAND IN FOR IT. The control column was
   * already there on 24 September and it did not catch this: it controls for
   * „was the whole day slow", and when the subject and the control are both a
   * different set of accounts it stays internally consistent and says nothing.
   * A reader who trusts the ratio to cover the population is the reader this
   * gate now has to warn.
   */
  it('says out loud that the ratio cannot see the population', () => {
    expect(slow).toContain('THE RATIO CANNOT SEE THE POPULATION');
  });
});
