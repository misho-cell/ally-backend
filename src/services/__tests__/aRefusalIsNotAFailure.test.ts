import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { isReadOnlySql } from '../../api/routes/roQuery.routes';

/**
 * `ok = false` IN `tool_call_log` MEANS TWO DIFFERENT THINGS, and for a day I
 * acted on the rarer one.
 *
 * `slow.sh` printed a column called `failed`. It is
 * `COUNT(*) FILTER (WHERE NOT ok)`, and `ok` is written by `outcomeOf` to mean
 * „the call did the thing". A guard declining on purpose did not do the thing.
 * A real fault did not do the thing. The biggest number in that column was
 *
 *     ask_contact    300 calls    122 „failed"
 *
 * and all eight of the top reasons behind it are guards working exactly as
 * designed — the person was already asked today, the plan was approved in this
 * same turn, the recipient opted out. 76 of the 122 were test seats hammering
 * it on purpose.
 *
 * AND THE AMBIGUITY ONLY RUNS ONE WAY. A tool that THROWS writes no row at
 * all: `runOneToolBlock` calls `logToolCall` after the await, so an exception
 * leaves nothing behind. The column named `failed` cannot see a crash and is
 * mostly counting the product working.
 *
 * Pinned from the source, because a shell script that reaches a live read-only
 * endpoint cannot be exercised here.
 */
const OPS = join(__dirname, '..', '..', '..', 'scripts', 'ops');
const read = (name: string): string => readFileSync(join(OPS, name), 'utf8');

const slow = read('slow.sh');
const why = read('why.sh');

describe('the column that was called failed', () => {
  it('is not called failed any more, in either table slow.sh prints', () => {
    expect(slow).toContain('AS said_no');
    expect(slow).not.toContain('AS failed');
    expect(slow).not.toMatch(/"failed"/);
  });

  /**
   * The rename on its own would be a smaller lie rather than none: „said no"
   * still reads as a fault to somebody scanning for a big number. The sentence
   * travels with the number, on both tables, where it cannot be missed.
   */
  it('says under the numbers what a no is and is not', () => {
    const notes = slow.match(/SAID NO IS NOT FAILED/g) ?? [];

    expect(notes).toHaveLength(2);
    expect(slow).toContain('why.sh');
  });

  it('records in its own header why the number was wrong to read', () => {
    const header = slow.slice(0, slow.indexOf('READY_PY='));

    expect(header).toContain('outcomeOf');
    expect(header).toContain('122');
    expect(header).toContain('writes no row at all');
  });
});

describe('why.sh classifies nothing', () => {
  /**
   * THE OBVIOUS NEXT MOVE IS A THIRD VALUE — ok / refused / broke — AND IT IS
   * A GUESS. It would have to be decided from the error TEXT, and „is the
   * message in Georgian" is a fact about who the sentence was written for, not
   * about whether anything is wrong: several of the English ones are guards
   * too. A classifier built on that reads as authority.
   *
   * So the reason is carried through verbatim and grouped, and the reader
   * decides. This test fails if anybody teaches the script to sort them.
   */
  it('carries the reason through as the product wrote it', () => {
    expect(why).toContain('LEFT(n.reason, 300)');
    expect(why).toContain('NOTHING HERE IS CLASSIFIED');
  });

  it('does not sort reasons into refusals and faults', () => {
    expect(why).not.toMatch(/\bGEORGIAN\b|\[ა-ჰ\]|u10A0|\\p\{Georgian\}/);
    expect(why).not.toMatch(/if .*(refusal|guard).*:/);
  });

  /**
   * A reason that carries a person's name — „person Avto Gegenava: route must
   * name one of the plan's routes" — is a new group every time, so the read
   * fills far faster than the number of distinct faults suggests. A total that
   * is quietly a partial one is the oldest fault in this codebase.
   */
  it('says so when the read filled its cap instead of printing a partial total', () => {
    expect(why).toContain('ROW_CAP=');
    expect(why).toContain('a FLOOR and not a count');
  });
});

describe('what the run did next, and what that does not mean', () => {
  /**
   * ⚠️ THE FIRST VERSION OF THIS SCRIPT HAD A COLUMN CALLED `lost`, defined as
   * „the run never came back", and I believed it until I ran it against the
   * live table: 148 of 271. The biggest single contributor was
   *
   *     „Nothing sent, and nothing is needed from you: you approved the plan
   *      in this same turn, and day one is already starting behind your reply"
   *
   * — a refusal whose entire purpose is to stop the run calling that tool. 21
   * runs obeyed it and my column called all 21 a loss.
   *
   * That is this month's recurring fault committed inside the script written
   * to stop it: the measurement was right and the question was different. So
   * three outcomes are printed and none of them is a verdict.
   */
  it('prints three outcomes and names none of them a loss', () => {
    // The HEADER says the word, at length, because the mistake is the point of
    // the file. What must not carry it is the part that prints.
    const printed = why.slice(why.indexOf("WHY_PY='"), why.indexOf('"$HERE/ro.sh"'));

    for (const outcome of ['->ok', '->no', 'stop']) {
      expect(printed).toContain(outcome);
    }
    expect(printed).not.toContain('LOST');
    expect(printed).toContain('STOP IS NOT A LOSS');
  });

  it('keeps the mistake in the file rather than only the fix', () => {
    expect(why).toContain('148 of 271');
    expect(why).toContain('the measurement was right and the question was different');
  });

  /**
   * „Tried again and got another no" is the one line here that needs no
   * interpretation: the run did not accept the answer. It is the section a
   * reader is sent to, and it is not the same set as `stop`.
   */
  it('reports the runs that asked twice and were refused twice', () => {
    expect(why).toContain('TRIED THE SAME CALL AGAIN AND GOT ANOTHER NO');
    expect(why).toContain('runs_tried_again');
  });

  /**
   * A connector call has no run. „What did the run do next" is unanswerable
   * for it, and this codebase's whole discipline is that „could not look" is
   * never reported as „looked and found nothing".
   */
  it('counts connector calls apart instead of answering for them', () => {
    expect(why).toContain('no_run_calls');
    expect(why).toContain('cannot be asked of them and they are in none of the three counts');
  });
});

describe('the exit code is the answer', () => {
  it('separates could-not-look from nothing-said-no', () => {
    const header = why.slice(0, why.indexOf('set -uo pipefail'));

    expect(header).toMatch(/0 = read it/);
    expect(header).toMatch(/1 = nothing said no/);
    expect(header).toMatch(/2 = could not look/);
  });

  /**
   * The same trap as `quiet.sh | tail` and `slow.sh | head`: a verdict thrown
   * away by the plumbing. The pipeline's status must be python's, and a reader
   * who closes the pipe must not be able to change it.
   */
  it('leaves with python’s status and not curl’s', () => {
    expect(why).toContain('exit "${PIPESTATUS[1]}"');
    expect(why).toContain('os._exit(VERDICT[0])');
  });

  /**
   * An empty window is the one answer here that is easy to misread as good
   * news, and for this product it almost always means nobody called anything.
   */
  it('refuses to read an empty window as everything working', () => {
    expect(why).toContain('before reading it as good news');
  });
});

/**
 * THE GUARD ON THE READ-ONLY ENDPOINT CANNOT TELL A COMMENT FROM A SECOND
 * STATEMENT, and it should not try to.
 *
 * `isReadOnlySql` rejects an interior semicolon by plain text search. Twice on
 * 25 September a semicolon inside a `--` COMMENT — prose, explaining the query
 * — got the whole read refused, once in this new script and once in slow.sh.
 * Each time the message was „one SELECT/WITH statement only", which reads as
 * „your SQL is malformed" and sends you looking at the SQL.
 *
 * So every statement this repo sends is checked here, against the REAL guard
 * rather than a copy of its rules, before anybody runs it against production.
 */
describe('every ops query passes the endpoint’s own guard', () => {
  const scripts = readdirSync(OPS).filter((name) => name.endsWith('.sh'));

  /**
   * The heredoc body cannot be taken as „everything after the `<<SQL` line":
   * these scripts pipe into an inline python block, so the COMMAND spans
   * dozens of lines and that reading swallows the python. The statement is
   * found from its terminator backwards, at the last line opening with a word
   * the endpoint accepts — which is the same anchor `isReadOnlySql` uses.
   *
   * Shell expansions are blanked, because what is under test is the literal
   * text this repo sends and not what a particular argument makes of it.
   */
  const statementsIn = (source: string): string[] => {
    const found: string[] = [];
    for (const end of [...source.matchAll(/\nSQL\n/g)]) {
      const upto = source.slice(0, end.index);
      const starts = [...upto.matchAll(/\n(?:WITH|SELECT|EXPLAIN)\b/g)];
      const last = starts[starts.length - 1];
      if (last === undefined) continue;
      found.push(upto.slice(last.index + 1).replace(/\$\{?[A-Za-z_][A-Za-z0-9_]*\}?/g, ''));
    }
    return found;
  };

  it('finds the queries at all, so a passing suite is not an empty one', () => {
    const found = scripts.flatMap((name) => statementsIn(read(name)));

    expect(found.length).toBeGreaterThanOrEqual(8);
  });

  for (const name of scripts) {
    const statements = statementsIn(read(name));
    if (statements.length === 0) continue;
    it(`${name}: ${statements.length} statement(s) the endpoint would accept`, () => {
      for (const sql of statements) {
        expect({ script: name, ok: isReadOnlySql(sql), semicolon: sql.includes(';') }).toEqual({
          script: name,
          ok: true,
          semicolon: false,
        });
      }
    });
  }
});
