jest.mock('../../db/postgres/client', () => ({ __esModule: true, query: jest.fn() }));

import { readFileSync } from 'fs';
import { join } from 'path';

import { query } from '../../db/postgres/client';
import { ownerWasAskedAndHasNotAnswered } from '../taskEngine.service';

const mockQuery = query as jest.MockedFunction<typeof query>;

/**
 * ⚠️ ROW 267 — IT ASKED THE OWNER A QUESTION AND THEN DID NOT WAIT FOR IT.
 *
 * Thread 24391, by the clock:
 *
 *   10:26:23  „I'm moving to Argentina next year for business. Who could help?"
 *   10:26:46  „What kind of business is this, and what would help most …?"
 *   10:26:55  a goal is saved and the plan wake fires — NINE SECONDS LATER
 *   10:27:19  „Plan v1 (awaiting your approval)", two buttons, asking again
 *
 * The person is asked something and, before they can type a word, handed a
 * plan built without their answer.
 *
 * The engine could not see it. `nothingToPlanYet` asks about the plan, the
 * one-person-instruction shape, and outward action — none of which is „the
 * owner is mid-sentence". The question was asked in ORDINARY PROSE rather than
 * through `ask_owner_decision`, so the one flag that exists, `pending_question_at`,
 * is null and says nothing.
 *
 * MEASURED, over 338 goals in seven days: this holds TWO of them. It fires on
 * the reported shape and on almost nothing else.
 *
 * ⚠️ AND THE FIRST MEASUREMENT I RAN SAID ZERO. Its two subqueries read
 * DIFFERENT ROWS — one bounded to the moment the goal was created and one not
 * — so it was answering a question I had not asked, while a direct test on
 * 24391 said the gate would hold. Two results that could not both be true is
 * the only reason I looked again.
 */
beforeEach(() => jest.clearAllMocks());

describe('the plan waits while the owner owes an answer', () => {
  it('holds when the last thing said was a question from us', async () => {
    mockQuery.mockResolvedValue({ rows: [{ waiting: true }], rowCount: 1 } as never);

    expect(await ownerWasAskedAndHasNotAnswered(1)).toBe(true);
  });

  it('does not hold when the owner spoke last', async () => {
    mockQuery.mockResolvedValue({ rows: [{ waiting: false }], rowCount: 1 } as never);

    expect(await ownerWasAskedAndHasNotAnswered(1)).toBe(false);
  });

  /** An empty thread is not a thread with a question in it. */
  it('does not hold when nothing has been said at all', async () => {
    mockQuery.mockResolvedValue({ rows: [], rowCount: 0 } as never);

    expect(await ownerWasAskedAndHasNotAnswered(1)).toBe(false);
  });

  it('reads only the newest message, and only a real one', async () => {
    mockQuery.mockResolvedValue({ rows: [{ waiting: false }], rowCount: 1 } as never);

    await ownerWasAskedAndHasNotAnswered(7);
    const sql = String(mockQuery.mock.calls[0][0]);

    expect(sql).toContain('ORDER BY c.created_at DESC');
    expect(sql).toContain('LIMIT 1');
    // Steps and events are not somebody speaking.
    expect(sql).toContain("c.kind = 'message'");
    expect(sql).toContain("TRIM(c.content) <> ''");
  });

  /** Every query in this file carries one. */
  it('has a timeout', () => {
    expect(mockQuery).toBeDefined();
    const src = readFileSync(join(__dirname, '..', 'taskEngine.service.ts'), 'utf8');
    const fn = src.slice(src.indexOf('export async function ownerWasAskedAndHasNotAnswered'));

    expect(fn.slice(0, 1400)).toContain('OWNER_QUIET_QUERY_TIMEOUT_MS');
  });
});

describe('it postpones and does not cancel', () => {
  const src = readFileSync(join(__dirname, '..', 'taskEngine.service.ts'), 'utf8');

  /**
   * ⚠️ THE DISTINCTION IS THE WHOLE DESIGN, and I checked it rather than
   * assuming: `getGoalsSilentForDays` requires `plan IS NOT NULL`, so a goal
   * with NO plan is never picked up by the method-change sweep. Dropping the
   * wake outright would leave a goal nobody ever plans if the owner never
   * answers. Cancelling would have been the tidier code and the worse product.
   */
  it('re-arms itself instead of giving up', () => {
    const fn = src.slice(src.indexOf('export function startPlanProposal'));

    expect(fn.slice(0, 2200)).toContain('startPlanProposal(taskId, attempt + 1)');
  });

  it('gives up holding after a bounded number of tries and plans anyway', () => {
    const fn = src.slice(src.indexOf('export function startPlanProposal'));

    expect(src).toContain('const PLAN_POSTPONE_ATTEMPTS = 3;');
    expect(fn.slice(0, 2600)).toContain('planning anyway');
  });

  it('waits longer on a hold than on the first pass', () => {
    expect(src).toContain('const PLAN_POSTPONE_MS = 15 * 60_000;');
    expect(src).toContain('attempt === 1 ? PLAN_PROPOSAL_DELAY_MS : PLAN_POSTPONE_MS');
  });
});
