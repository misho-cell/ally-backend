const dbQuery = jest.fn();
jest.mock('../../db/postgres/client', () => ({
  __esModule: true,
  query: (...args: unknown[]) => dbQuery(...args),
}));

import { readFileSync } from 'fs';
import { join } from 'path';
import { unmergeCandidate, undoCandidateDecision, unmergePerson } from '../identity.service';

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
 * AND THE OLD ROUTE WAS LEFT LIVE, WHICH IS NOT A GUARD.
 *
 * `unmergeCandidate` undoes one approval exactly and the admin page is moving
 * to it — but until it has, the undo button still calls `unmergePerson`, which
 * takes the WHOLE person. Writing that down and leaving it reachable is
 * relying on somebody else shipping promptly.
 *
 * Measured: 466 people in the mapping, SIX built from more than one approval,
 * one from three. For those six, and only those, the old undo removes phones
 * no single decision added.
 *
 * The capability stays — taking a person apart is a real thing to want. It is
 * now a deliberate act rather than the default reading of a button labelled
 * „undo".
 */
describe('the old whole-person route cannot be pressed by accident', () => {
  it('refuses a person built from several approvals, and names the other route', async () => {
    dbQuery.mockResolvedValueOnce({ rows: [{ merges: '3' }], rowCount: 1 });

    const outcome = await unmergePerson('f0000000-0000-4000-8000-000000000001', ACTOR);

    expect(outcome.ok).toBe(false);
    expect(outcome.error).toContain('3 separate approvals');
    expect(outcome.error).toContain('/admin/identity/candidates/:id/unmerge');
    expect(sqlCalls().some((s) => s.includes('DELETE FROM person_identities'))).toBe(false);
  });

  it('still works on a person one approval created', async () => {
    dbQuery
      .mockResolvedValueOnce({ rows: [{ merges: '1' }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ phone: 'a' }], rowCount: 1 });

    const outcome = await unmergePerson('f0000000-0000-4000-8000-000000000001', ACTOR);

    expect(outcome.ok).toBe(true);
    expect(sqlCalls().some((s) => s.includes('DELETE FROM person_identities'))).toBe(true);
  });

  /** Deliberate is allowed. It just has to be said. */
  it('does it anyway when the caller says whole_person', async () => {
    dbQuery.mockResolvedValueOnce({ rows: [{ phone: 'a' }, { phone: 'b' }], rowCount: 2 });

    const outcome = await unmergePerson('f0000000-0000-4000-8000-000000000001', ACTOR, true);

    expect(outcome.ok).toBe(true);
    // And it did not even ask the log: the caller has already answered it.
    expect(sqlCalls().some((s) => s.includes('person_merge_log') && s.includes('COUNT'))).toBe(
      false,
    );
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

/**
 * ⚠️ 25 SEPTEMBER — THE SAME BUTTON, THE OTHER DECISION, AND NOTHING BEHIND IT.
 *
 * The founder on /admin/identity at 12:53. He pressed „უარყოფა" on candidate
 * #232, the green bar offered „უკან წაღება", he pressed it, and the red bar
 * said **„No approved candidate with that id."** #232 is still rejected.
 *
 * The screen has ONE undo. The undo after a REJECT was calling the undo for an
 * APPROVAL, and that path only ever looked at `status = 'approved'` — so the
 * button was live, the request was well formed, and the answer was a 404 about
 * a decision nobody had made. Row 236's first half was the same shape: the
 * page asked for something, and the server answered about something else.
 *
 * Which decision is being taken back is a fact the SERVER holds. Making the
 * page choose between two routes would be asking it to know what it has no
 * way of knowing.
 */
describe('undo after a reject, which had no server behind it', () => {
  function statusIs(status: string): void {
    dbQuery.mockResolvedValueOnce({ rows: [{ status }], rowCount: 1 });
  }

  it('puts a rejected candidate back in the queue', async () => {
    statusIs('rejected');
    dbQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });

    const outcome = await undoCandidateDecision(232, ACTOR);

    expect(outcome.ok).toBe(true);
    const update = dbQuery.mock.calls.find((c) =>
      String(c[0]).includes('UPDATE identity_candidates'),
    );
    expect(String(update?.[0])).toContain("SET status = 'pending'");
    expect(String(update?.[0])).toContain("AND status = 'rejected'");
    expect(update?.[1]).toEqual([232]);
  });

  /**
   * A rejection created nothing, so taking it back is one column. A row in
   * `person_merge_log` saying „unmerge" would describe something that never
   * happened, and that log is read to answer what was merged.
   */
  it('touches no phone and writes nothing to the merge log', async () => {
    statusIs('rejected');
    dbQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });

    await undoCandidateDecision(232, ACTOR);

    expect(sqlCalls().some((s) => s.includes('DELETE FROM person_identities'))).toBe(false);
    expect(sqlCalls().some((s) => s.includes('person_merge_log'))).toBe(false);
  });

  /** The approval path is unchanged and still reached through the same door. */
  it('still unmerges when the decision was an approval', async () => {
    statusIs('approved');
    dbQuery.mockResolvedValueOnce({ rows: [approved()], rowCount: 1 });

    const outcome = await undoCandidateDecision(7, ACTOR);

    expect(outcome.ok).toBe(true);
    expect(sqlCalls().some((s) => s.includes('DELETE FROM person_identities'))).toBe(true);
  });

  /**
   * „Nothing to undo" and „no such candidate" are different facts, and one 404
   * over both is how a working queue looks like a missing row.
   */
  it('separates a pending candidate from one that does not exist', async () => {
    statusIs('pending');
    const nothing = await undoCandidateDecision(232, ACTOR);

    expect(nothing).toMatchObject({ ok: false, reason: 'nothing_to_undo' });
    expect(nothing.error).toContain('232');

    jest.clearAllMocks();
    dbQuery.mockResolvedValue({ rows: [], rowCount: 0 });
    const missing = await undoCandidateDecision(999999, ACTOR);

    expect(missing).toMatchObject({ ok: false, reason: 'not_found' });
  });

  /**
   * Decided again between the read and the write. Never reported as done —
   * „I could not" and „I did" are the two this codebase keeps having to keep
   * apart, and an undo that claims success on zero rows is the worst version
   * of it, because the screen then shows the queue as it was not.
   */
  it('does not report success when the write changed nothing', async () => {
    statusIs('rejected');
    dbQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

    const outcome = await undoCandidateDecision(232, ACTOR);

    expect(outcome).toMatchObject({ ok: false, reason: 'nothing_to_undo' });
  });
});

/**
 * THE ROUTE PICKS ITS STATUS CODE FROM A WORD, NOT FROM THE SENTENCE.
 *
 * It used to be `outcome.error?.startsWith('No approved candidate')`. A route
 * reading prose is a stale pointer waiting to happen: improve the wording and
 * the status silently becomes the wrong one, with nothing to notice it.
 */
describe('the status code is not read out of the error text', () => {
  const routes = readFileSync(
    join(__dirname, '..', '..', 'api', 'routes', 'admin.routes.ts'),
    'utf8',
  );

  it('maps the reason word to the code', () => {
    expect(routes).toContain('const UNMERGE_STATUS');
    expect(routes).toContain('not_found: 404');
    expect(routes).toContain('nothing_to_undo: 409');
    expect(routes).toContain('cannot_be_exact: 409');
  });

  /**
   * Only the CODE. The comment above the route quotes the old line on purpose
   * — the mistake is the reason the map exists, and deleting the evidence with
   * the bug is how a fix stops teaching anything.
   */
  it('no longer matches on the sentence', () => {
    const code = routes
      .split('\n')
      .filter((line) => {
        const t = line.trim();
        return !t.startsWith('*') && !t.startsWith('//') && !t.startsWith('/*');
      })
      .join('\n');

    expect(code).not.toContain("startsWith('No approved candidate')");
  });

  it('sends the page through the one undo that knows both decisions', () => {
    expect(routes).toContain('await undoCandidateDecision(id, actor)');
  });
});
