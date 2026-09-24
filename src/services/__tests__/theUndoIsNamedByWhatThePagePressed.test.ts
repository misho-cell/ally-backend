const dbQuery = jest.fn();
jest.mock('../../db/postgres/client', () => ({
  __esModule: true,
  query: (...args: unknown[]) => dbQuery(...args),
}));

import { readFileSync } from 'fs';
import { join } from 'path';
import { unmergeCandidate } from '../identity.service';

/**
 * ROW 236 — „merge two contacts, undo fails, and the page is hard to find".
 *
 * Lika approved a pair on the Identity tab, pressed undo, and got a red error
 * asking for a person id with no field to type one into.
 *
 * The page is right. It approved a CANDIDATE, so a candidate id is the only
 * name it has. `admin.routes.ts` even promised the matching route in a comment
 * — „Undo per pair: POST /admin/identity/candidates/:id/unmerge (existing)" —
 * and that route had never been written. The only undo took a `person_id`.
 *
 * ════════ AND THE BUG UNDERNEATH IS WORSE THAN THE ONE REPORTED ════════
 *
 * `unmergePerson` deletes EVERY phone mapped to that person. That is an undo
 * only when the approval created the person. Approve deliberately reuses an
 * existing person_id when a phone already belongs to one — so an approval can
 * EXTEND a person, and undoing it by person id unmaps phones it never touched.
 *
 *     merges that created a new person        465
 *     merges that extended an existing one      7
 *
 * Nobody had met it because NO UNMERGE HAD EVER SUCCEEDED: 472 merges in the
 * log and zero unmerges. The missing route was hiding a data-loss path behind
 * an error message.
 */
const ACTOR = 'admin:167250';

function approved(over: Record<string, unknown> = {}): Record<string, unknown> {
  return { person_id: 'f0000000-0000-4000-8000-000000000001', merged_phones: ['a', 'b'], ...over };
}

function sqlCalls(): string[] {
  return dbQuery.mock.calls.map((c) => String(c[0]));
}

beforeEach(() => {
  jest.clearAllMocks();
  dbQuery.mockResolvedValue({ rows: [], rowCount: 0 });
});

describe('it removes only what that approval created', () => {
  it('deletes the recorded phones and nothing else', async () => {
    dbQuery.mockResolvedValueOnce({ rows: [approved()], rowCount: 1 });

    const outcome = await unmergeCandidate(7, ACTOR);

    expect(outcome.ok).toBe(true);
    const del = dbQuery.mock.calls.find((c) =>
      String(c[0]).includes('DELETE FROM person_identities'),
    );
    expect(del).toBeDefined();
    expect(String(del?.[0])).toContain('phone = ANY($2)');
    expect(del?.[1]).toEqual(['f0000000-0000-4000-8000-000000000001', ['a', 'b']]);
  });

  /**
   * THE PHONE CLAUSE IS THE WHOLE POINT. Without it this is `unmergePerson`
   * wearing a different name, and the seven approvals that extended a person
   * would take that person's other phones with them.
   */
  it('never deletes by person alone', async () => {
    dbQuery.mockResolvedValueOnce({ rows: [approved()], rowCount: 1 });

    await unmergeCandidate(7, ACTOR);

    for (const sql of sqlCalls().filter((s) => s.includes('DELETE FROM person_identities'))) {
      expect(sql).toContain('phone = ANY');
    }
  });

  it('puts the pair back in the queue, which is what undo means to the presser', async () => {
    dbQuery.mockResolvedValueOnce({ rows: [approved()], rowCount: 1 });

    await unmergeCandidate(7, ACTOR);

    const update = sqlCalls().find((s) => s.includes('UPDATE identity_candidates'));
    expect(update).toContain("status = 'pending'");
    expect(update).toContain('merged_phones = NULL');
  });

  it('records the unmerge in the log', async () => {
    dbQuery.mockResolvedValueOnce({ rows: [approved()], rowCount: 1 });

    await unmergeCandidate(7, ACTOR);

    expect(sqlCalls().some((s) => s.includes("'unmerge'"))).toBe(true);
  });
});

describe('what it refuses to do', () => {
  /**
   * THE FAIL-CLOSED CASE. Seven approvals extended a person before this was
   * recorded, and the log says which person ids existed but not which phone
   * carried which — so the exact set cannot be recovered. A guess here unmaps a
   * real person's phone, and the table is still shadow, so nothing downstream
   * is waiting on it. It refuses and names the other route.
   */
  it('refuses when it cannot know what that approval added', async () => {
    dbQuery.mockResolvedValueOnce({
      rows: [approved({ merged_phones: null, person_id: null })],
      rowCount: 1,
    });

    const outcome = await unmergeCandidate(7, ACTOR);

    expect(outcome.ok).toBe(false);
    expect(outcome.error).toContain('/admin/identity/unmerge');
    expect(sqlCalls().some((s) => s.includes('DELETE FROM person_identities'))).toBe(false);
  });

  it('deletes nothing when the approval inserted nothing', async () => {
    dbQuery.mockResolvedValueOnce({ rows: [approved({ merged_phones: [] })], rowCount: 1 });

    const outcome = await unmergeCandidate(7, ACTOR);

    expect(outcome.ok).toBe(true);
    expect(sqlCalls().some((s) => s.includes('DELETE FROM person_identities'))).toBe(false);
    // But the pair still returns to the queue — the decision is undone even
    // though no mapping was its to remove.
    expect(sqlCalls().some((s) => s.includes("status = 'pending'"))).toBe(true);
  });

  it('says so when the candidate is not an approved one', async () => {
    dbQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

    const outcome = await unmergeCandidate(7, ACTOR);

    expect(outcome.ok).toBe(false);
    expect(outcome.error).toContain('No approved candidate');
  });
});

/**
 * AND THE APPROVAL HAS TO RECORD IT, or none of the above can be exact.
 * `RETURNING phone` on an insert with ON CONFLICT DO NOTHING names precisely
 * the rows that approval created — a phone that already belonged to somebody
 * is neither inserted nor returned.
 */
describe('approve writes down what it actually merged', () => {
  const source = readFileSync(join(__dirname, '..', 'identity.service.ts'), 'utf8');

  it('captures the inserted phones rather than the candidate’s', () => {
    const at = source.indexOf('INSERT INTO person_identities');

    expect(at).toBeGreaterThan(-1);
    const insert = source.slice(at, at + 400);
    expect(insert).toContain('ON CONFLICT (phone) DO NOTHING');
    expect(insert).toContain('RETURNING phone');
  });

  it('stores them on the candidate', () => {
    // The file holds several `UPDATE identity_candidates`; this is the one the
    // approval makes. Anchoring on the first match found an evidence-stamping
    // query three hundred lines away and would have passed or failed for
    // reasons unrelated to the thing being pinned.
    const at = source.indexOf("SET status = 'approved'");

    expect(at).toBeGreaterThan(-1);
    expect(source.slice(at, at + 200)).toContain('merged_phones = $4');
    expect(source.slice(at, at + 200)).toContain('person_id = $3::uuid');
  });

  it('the migration adds the columns and backfills only what is provable', () => {
    const sql = readFileSync(
      join(
        __dirname,
        '..',
        '..',
        'db',
        'postgres',
        'migrations',
        '174_identity_candidate_knows_what_it_merged.sql',
      ),
      'utf8',
    );

    expect(sql).toContain('ADD COLUMN IF NOT EXISTS merged_phones');
    // The two conditions that make the backfill exact rather than a guess.
    expect(sql).toContain('cardinality(m.prior_person_ids) = 0');
    expect(sql).toMatch(/COUNT\(\*\)[\s\S]{0,200}= 1;/);
  });
});

/** The route the code's own comment had promised for days. */
describe('the route exists now', () => {
  const routes = readFileSync(
    join(__dirname, '..', '..', 'api', 'routes', 'admin.routes.ts'),
    'utf8',
  );

  it('is mounted at the path the page was already calling', () => {
    expect(routes).toContain("adminRouter.post('/identity/candidates/:id/unmerge'");
  });

  /** „I cannot be exact" is not „you sent the wrong thing". */
  it('answers 409 rather than 400 when it cannot be exact', () => {
    const at = routes.indexOf("adminRouter.post('/identity/candidates/:id/unmerge'");

    expect(routes.slice(at, at + 900)).toContain('409');
  });
});
