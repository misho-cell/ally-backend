/**
 * THE SIX FIXES NOBODY COULD TEST, RUN AGAINST A REAL POSTGRES.
 *
 * Skipped unless PG_INTEGRATION=1 with POSTGRES_* pointing at a scratch
 * database — the same convention `searchPg.integration.test.ts` already uses.
 * `scripts/ops/malformed.sh` stands that database up and runs this file.
 *
 * ════════ WHY IT EXISTS — 27 SEPTEMBER ════════
 *
 * Six of the night's nineteen verification items are guards on a tool call
 * that arrives with a field MISSING, and NOBODY COULD TEST THEM. The tester
 * cannot: driving a conversation will not make the model omit a required
 * field, and calling the tools directly on a seat is refused by their own
 * session's permission check.
 *
 * ⚠️ AND THE UNIT TESTS CANNOT EITHER, in the way that matters. What broke was
 * `Number(undefined)` -> `NaN` -> `pg` sending the STRING „NaN" -> Postgres
 * raising `invalid input syntax for type integer`. Every step of that lives in
 * the driver and the database. A test with a mocked `query` asserts only that
 * a function returned `false` — which it would also do if the guard were
 * wrong and the crash were still sitting behind it. Green, and silent about
 * the one thing worth knowing.
 *
 * So each item runs TWICE: the raw query with the same malformed value, which
 * must THROW — that is what proves the bug was real rather than remembered —
 * and then the shipped function, which must answer and not throw. And the
 * POSITIVE case on a row that exists, because a guard that refuses everything
 * is the same bug from the other side and the easier one to ship by accident.
 *
 * ════════ WHAT IT DOES NOT PROVE, SAID BEFORE ANYBODY ASKS ════════
 *
 * There is no model and no person in this. It cannot say that the tool wrapper
 * passes the field through, and it cannot say what somebody sees on a screen.
 * On the morning of this same day a „fix" of mine guarded a function that is
 * never called, eleven tests went green, and two people were told it was done.
 * Green here is not that kind of green either: this is the half a conversation
 * could never reach, and it is not the whole.
 */
import pool, { query } from '../../db/postgres/client';
import { FactRefusedError, submitContactFact } from '../contactFacts.service';
import { approveTaskPlan, proposeTaskPlan } from '../taskPlans.service';
import { createRelayAsk } from '../taskAsks.service';
import { getTaskById, grantTaskPermission, setTaskBrief, setTaskWake } from '../taskStore.service';
import { PROFILE_LINE_NEEDS_BOTH, setUserProfileField } from '../userProfile.service';

const maybeDescribe = process.env.PG_INTEGRATION === '1' ? describe : describe.skip;

const OWNER = 'verify-owner';
/** `contact_facts.submitted_by_user_id` is an INTEGER, so that door needs a numeric owner. */
const FACT_OWNER = '90001';
const A_REAL_PHONE = '+995555123456';

/**
 * ⚠️ THE SCHEMA IS NOT WRITTEN HERE, and that is deliberate.
 *
 * `malformed.sh` builds these tables by replaying this repo's own migration
 * DDL. A `CREATE TABLE` typed into a test file would prove a property of what
 * I typed: the three facts under test are that `tasks.id` is INTEGER, that
 * `user_profile_kv.key` and `.value` are TEXT NOT NULL, and that they sit
 * under a UNIQUE (user_id, key). Write those by hand and the test agrees with
 * itself no matter what shipped.
 */

/** „Did the old shape really crash?" — asked by running it, not by remembering it. */
async function messageFrom(run: () => Promise<unknown>): Promise<string> {
  try {
    await run();
    return 'NO THROW — it completed. The crash this guards is gone on its own; re-read the guard.';
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

maybeDescribe('a missing field cannot reach the database', () => {
  let taskId = 0;

  beforeAll(async () => {
    const inserted = await query<{ id: number }>(
      `INSERT INTO tasks (user_id, title, status) VALUES ($1, $2, 'open') RETURNING id`,
      [OWNER, 'a goal that exists'],
      30_000,
    );
    taskId = inserted.rows[0].id;
  });

  afterAll(async () => {
    await pool.end();
  });

  describe('item 7 — a goal id that is not a goal id', () => {
    it('really does crash without the guard', async () => {
      const said = await messageFrom(() =>
        query(`UPDATE tasks SET brief = $2 WHERE id = $1`, [Number(undefined), 'x']),
      );

      expect(said).toContain('invalid input syntax for type integer');
      expect(said).toContain('NaN');
    });

    it('answers instead of throwing, on all four doors', async () => {
      const notANumber = Number(undefined);

      await expect(setTaskBrief(OWNER, notANumber, 'a brief for nobody')).resolves.toBe(false);
      await expect(setTaskWake(OWNER, notANumber, 4)).resolves.toBe(false);
      await expect(grantTaskPermission(OWNER, notANumber)).resolves.toBe(false);
      await expect(getTaskById(notANumber)).resolves.toBeNull();
    });

    /** The other side, which is the easier bug to ship. */
    it('still works on a goal that exists', async () => {
      await expect(setTaskBrief(OWNER, taskId, 'a brief for a real goal')).resolves.toBe(true);
      await expect(setTaskWake(OWNER, taskId, 4)).resolves.toBe(true);

      const found = await getTaskById(taskId);
      expect(found?.id).toBe(taskId);
      expect(found?.brief).toBe('a brief for a real goal');
    });
  });

  /**
   * ⚠️ MEASURED, NOT ASSUMED: the error the CALLER gets is not the error the
   * guard returns. `relayAskInner` answers „Ask not found."; the exported
   * `createRelayAsk` then appends the long Georgian instruction that tells the
   * model what to say and reminds it that relaying and answering are two
   * different things. So the delivered string STARTS WITH the sentence and is
   * not equal to it — which is how the item is written on the tester's list,
   * and it is worth pinning that the reminder is still attached to a failure.
   */
  /**
   * ⚠️ NOT ON THE LIST — FOUND BY SWEEPING FOR THE REST OF THE DOOR, 22:45.
   *
   * Tonight's fix put `isARealId` where „every door meets" for the four
   * `taskStore` functions. It is not where every door meets. `chat.service.ts`
   * hands `Number(input['task_id'])` to `proposeTaskPlan` and `approveTaskPlan`
   * as well, and NEITHER guards it — both go straight into
   * `WHERE id = $1 AND user_id = $2`, so the same missing field reaches
   * Postgres as the string „NaN" and raises.
   *
   * The approve door checks `confirmed` and checks the screen and never checks
   * the id at all, which is the shape of the whole day: the measurement was
   * right and the question was different. What made it invisible is also
   * tonight's doing — since the thrown-tool wrapper, this no longer kills the
   * run. The model gets a failure, apologises, and the owner sees a plan that
   * silently did not get approved.
   *
   * These two run BEFORE the fix and are the reason for it.
   */
  describe('the plan doors — the same id, unguarded until tonight', () => {
    it('answers instead of throwing when the goal id is missing', async () => {
      await expect(proposeTaskPlan(OWNER, Number(undefined), { steps: [] })).resolves.toMatchObject(
        { ok: false },
      );

      await expect(approveTaskPlan(OWNER, Number(undefined))).resolves.toMatchObject({
        ok: false,
      });
    });

    it('answers instead of throwing when the goal id is a word', async () => {
      await expect(approveTaskPlan(OWNER, Number('the vet one'))).resolves.toMatchObject({
        ok: false,
      });
    });

    /**
     * The other side, and on these two doors it is the side that matters: a
     * guard that refused every id would mean no plan could ever be proposed
     * or approved again, which is row 1 — the wall — from the opposite
     * direction.
     */
    it('still proposes and approves a plan on a goal that exists', async () => {
      const proposed = await proposeTaskPlan(OWNER, taskId, {
        solved_when: 'a vet is found',
        routes: [{ name: 'ask two people', status: 'running' }],
      });
      expect(proposed.ok).toBe(true);

      const approved = await approveTaskPlan(OWNER, taskId);
      expect(approved.ok).toBe(true);
    });
  });

  describe('item 8 — an ask id that is not an ask id', () => {
    it('answers "Ask not found." for a missing id', async () => {
      const outcome = await createRelayAsk(OWNER, Number(undefined), 'somebody');

      expect(outcome.sent).toBe(false);
      expect(outcome.error?.startsWith('Ask not found.')).toBe(true);
      expect(outcome.error).toContain('send_answer_to_asker');
    });

    /**
     * A WORD, not only a missing field. `id = NULL` merely matches nothing;
     * `id = 'abc'` is what makes Postgres raise. They are different inputs and
     * only one of them was ever the accident anybody thought about.
     */
    it('answers the same for a word', async () => {
      const outcome = await createRelayAsk(OWNER, Number('the first one'), 'somebody');

      expect(outcome.sent).toBe(false);
      expect(outcome.error?.startsWith('Ask not found.')).toBe(true);
    });
  });

  describe('items 11 and 12 — a profile line under no key', () => {
    /**
     * Both columns are TEXT NOT NULL under a UNIQUE (user_id, key), which is
     * the whole reason an empty key is worse than a crash: the row STORES,
     * every such save collapses onto the same row, and no read for a real key
     * ever finds it again.
     */
    it('really does violate not-null without the guard', async () => {
      const said = await messageFrom(() =>
        query(`INSERT INTO user_profile_kv (user_id, key, value) VALUES ($1, $2, $3)`, [
          OWNER,
          null,
          'a value',
        ]),
      );

      expect(said).toContain('null value in column "key"');
    });

    it('refuses a missing key and a missing value, and says which', async () => {
      await expect(setUserProfileField(OWNER, '', 'a value with nowhere to live')).resolves.toEqual(
        {
          saved: false,
          error: PROFILE_LINE_NEEDS_BOTH,
        },
      );
      await expect(setUserProfileField(OWNER, 'a key', '')).resolves.toEqual({
        saved: false,
        error: PROFILE_LINE_NEEDS_BOTH,
      });
      await expect(setUserProfileField(OWNER, '   ', '   ')).resolves.toEqual({
        saved: false,
        error: PROFILE_LINE_NEEDS_BOTH,
      });
    });

    it('still saves and reads back a real line', async () => {
      await expect(setUserProfileField(OWNER, 'city', 'Tbilisi')).resolves.toEqual({ saved: true });

      const back = await query<{ value: string }>(
        `SELECT value FROM user_profile_kv WHERE user_id = $1 AND key = 'city'`,
        [OWNER],
      );
      expect(back.rows[0]?.value).toBe('Tbilisi');
    });

    /** The collapse the guard prevents, demonstrated rather than described. */
    it('left no row behind for any of the refused saves', async () => {
      const rows = await query<{ n: string }>(
        `SELECT COUNT(*)::text AS n FROM user_profile_kv WHERE user_id = $1`,
        [OWNER],
      );

      expect(rows.rows[0]?.n).toBe('1');
    });
  });

  /**
   * ⚠️ ITEM 10, AND MY OWN LIST HAD IT WRONG.
   *
   * I told the tester that `save_contact_fact` with no `field_type` answers
   * `{ saved: false, error }`. It does not and never did: the chat door
   * coerces to `''` and `submitContactFact` does
   * `fieldTypeRaw.trim().toLowerCase() || 'note'`, so an omitted field
   * DEFAULTS and the fact stores as a note.
   *
   * What that call's fix actually did was stop a crash — before it the field
   * arrived as `undefined`, `.trim()` threw a TypeError, and nothing catches a
   * tool that throws, so the person's whole run died. „The run continues and a
   * note is saved" is the right test; „the tool refuses" is not. Had the
   * tester been able to run it, a CORRECT system would have looked like a
   * failure, and I would have handed them the reason to report it. A wrong
   * expected answer costs more than no test at all.
   */
  describe('item 10 — a fact with no field type', () => {
    it('really does throw on the old cast', async () => {
      const said = await messageFrom(async () => (undefined as unknown as string).trim());

      expect(said).toContain('trim');
    });

    it('DEFAULTS to a note — it does not refuse', async () => {
      await submitContactFact(FACT_OWNER, A_REAL_PHONE, '', 'works at a bakery');

      const stored = await query<{ field_type: string }>(
        `SELECT field_type FROM contact_facts
          WHERE submitted_by_user_id = $1 AND value = $2`,
        [FACT_OWNER, 'works at a bakery'],
      );
      expect(stored.rows[0]?.field_type).toBe('note');
    });

    /** The two that ARE refusals on this door, so the three stay apart. */
    it('refuses a digitless phone and an empty value, as FactRefusedError', async () => {
      await expect(
        submitContactFact(FACT_OWNER, 'unknown', 'occupation', 'a baker'),
      ).rejects.toBeInstanceOf(FactRefusedError);

      await expect(submitContactFact(FACT_OWNER, A_REAL_PHONE, 'occupation', '')).rejects.toThrow(
        'non-empty value',
      );
    });
  });
});
