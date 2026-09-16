/**
 * Ticket 20 row 147 — closing a goal recorded it as SOLVED.
 *
 * The stage expression read:
 *
 *   WHEN t.status = 'closed' AND closed_reason ILIKE '%stop%' THEN 'stopped'
 *   WHEN t.status = 'closed'                                  THEN 'solved'
 *
 * So every closed goal was solved unless its free-text note happened to carry
 * the English substring "stop". Tonight four of Tornike's goals were closed on
 * his own word with the note "closed on Tornike's request" and all four read
 * solved. Nothing was solved, and the engine that learns from outcomes would
 * have counted them as wins.
 *
 * It is row 131's family once more — a substring standing in for a word — this
 * time in SQL, against a note that is usually Georgian and so could never have
 * matched an English one.
 */
import { GOAL_STAGE_SQL } from '../goalQuestions.service';

describe('row 147 — how a goal was closed is stored, not guessed', () => {
  it('no longer reads the owner’s note for an English word', () => {
    expect(GOAL_STAGE_SQL).not.toContain("ILIKE '%stop%'");
    expect(GOAL_STAGE_SQL).not.toContain('closed_reason');
  });

  it('solved requires the stored signal, and nothing else does', () => {
    expect(GOAL_STAGE_SQL).toContain("t.closed_as = 'finished' THEN 'solved'");
    // The fall-through: closed and not finished is stopped, never solved.
    // Comment lines are not branches — the SQL explains itself and says the
    // word while doing so.
    const solvedBranches = GOAL_STAGE_SQL.split('\n')
      .filter((l) => !l.trim().startsWith('--'))
      .filter((l) => l.includes("'solved'"));
    expect(solvedBranches).toHaveLength(1);
  });

  it('a goal closed before the column existed reads stopped, not solved', () => {
    // closed_as is NULL on every historical row. We do not know how those were
    // closed, so the expression must not claim a win for them.
    const closedBranch = GOAL_STAGE_SQL.indexOf("WHEN t.status = 'closed' THEN");
    expect(GOAL_STAGE_SQL.slice(closedBranch, closedBranch + 60)).toContain("'stopped'");
  });
});
