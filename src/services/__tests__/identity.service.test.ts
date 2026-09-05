jest.mock('../../db/postgres/client', () => ({ query: jest.fn(), __esModule: true }));

import { query } from '../../db/postgres/client';
import {
  runIdentityScan,
  runIdentityScanTick,
  listIdentityCandidates,
  approveIdentityCandidate,
  rejectIdentityCandidate,
  unmergePerson,
  backfillCandidateNameReach,
  PAIR_CAP_PER_BATCH,
  exportIdentityCandidates,
  applyIdentityDecisions,
  looksLikeAName,
} from '../identity.service';

const mockQuery = query as jest.MockedFunction<typeof query>;

function rows(data: unknown[], rowCount = data.length): { rows: unknown[]; rowCount: number } {
  return { rows: data, rowCount };
}

beforeEach(() => jest.clearAllMocks());

describe('runIdentityScan — the shadow scan: mapping only, raw data untouched', () => {
  function routeScanQueries(opts: {
    multiPhoneAccounts?: { userId: number; phones: string[] }[];
    alreadyMapped?: { phone: string; person_id: string }[];
    autoInserted?: string[];
    maxOwner?: number;
    pairs?: { phone_1: string; phone_2: string; co_owners: string; sample_alias: string }[];
    candidateInserted?: boolean;
  }): void {
    mockQuery.mockImplementation((sql: string) => {
      if (sql.includes('HAVING COUNT(*) >= 2'))
        return Promise.resolve(rows(opts.multiPhoneAccounts ?? []) as never);
      if (sql.includes('SELECT phone, person_id FROM person_identities'))
        return Promise.resolve(rows(opts.alreadyMapped ?? []) as never);
      if (sql.includes('INSERT INTO person_identities'))
        return Promise.resolve(
          rows((opts.autoInserted ?? []).map((phone) => ({ phone }))) as never,
        );
      if (sql.includes('INSERT INTO person_merge_log')) return Promise.resolve(rows([]) as never);
      if (sql.includes('MAX("contactId")'))
        return Promise.resolve(rows([{ max: opts.maxOwner ?? 100 }]) as never);
      if (sql.includes('MIN(a.alias) AS sample_alias'))
        return Promise.resolve(rows(opts.pairs ?? []) as never);
      if (sql.includes('COUNT(DISTINCT a."contactId") AS co_owners'))
        // One query counts every discovered pair; the rows come back keyed by
        // the pair, not as a bare number.
        return Promise.resolve(
          rows(
            (opts.pairs ?? []).map((p) => ({
              phone_1: p.phone_1,
              phone_2: p.phone_2,
              co_owners: p.co_owners,
            })),
          ) as never,
        );
      if (sql.includes('INSERT INTO identity_candidates'))
        return Promise.resolve(rows(opts.candidateInserted === false ? [] : [{ id: 1 }]) as never);
      return Promise.resolve(rows([]) as never);
    });
  }

  it("auto-merges ONLY a registered account's own numbers — confidence 1.0 by definition", async () => {
    routeScanQueries({
      multiPhoneAccounts: [{ userId: 7, phones: ['+995599000001', '599000002'] }],
      autoInserted: ['+995599000001', '+995599000002'],
      maxOwner: 10,
    });

    const out = await runIdentityScan(1);

    expect(out.auto_merged_people).toBe(1);
    expect(out.auto_merged_phones).toBe(2);
    const insert = mockQuery.mock.calls.find(([sql]) =>
      (sql as string).includes('INSERT INTO person_identities'),
    );
    // Normalized to one canonical form, confidence literal 1.0 in the SQL.
    expect(insert?.[0]).toContain('1.0');
    expect(insert?.[1]?.[1]).toEqual(['+995599000001', '+995599000002']);
  });

  it('writes nothing for an account whose numbers are already merged', async () => {
    // Auto-merge runs on every scan tick and all 392 multi-phone accounts are
    // already merged — it was spending the batch on 392 no-op INSERTs.
    routeScanQueries({
      multiPhoneAccounts: [{ userId: 7, phones: ['+995599000001', '+995599000002'] }],
      alreadyMapped: [
        { phone: '+995599000001', person_id: 'p-1' },
        { phone: '+995599000002', person_id: 'p-1' },
      ],
      maxOwner: 10,
    });

    const out = await runIdentityScan(1);

    expect(out.auto_merged_people).toBe(0);
    expect(
      mockQuery.mock.calls.some(([sql]) =>
        (sql as string).includes('INSERT INTO person_identities'),
      ),
    ).toBe(false);
  });

  it('joins the person a sibling number already belongs to, never mints a second id', async () => {
    // One phone mapped, one not: minting a fresh id splits one human across
    // two person_ids, and ON CONFLICT hides it — the mapped phone keeps the
    // old id while its sibling takes the new one.
    routeScanQueries({
      multiPhoneAccounts: [{ userId: 7, phones: ['+995599000001', '+995599000002'] }],
      alreadyMapped: [
        { phone: '+995599000001', person_id: 'ffffffff-0000-0000-0000-000000000001' },
      ],
      autoInserted: ['+995599000002'],
      maxOwner: 10,
    });

    await runIdentityScan(1);

    const insert = mockQuery.mock.calls.find(([sql]) =>
      (sql as string).includes('INSERT INTO person_identities'),
    );
    expect(insert?.[1]?.[0]).toBe('ffffffff-0000-0000-0000-000000000001');
  });

  it('queues a name-match pair as a CANDIDATE with its evidence — never merges it', async () => {
    routeScanQueries({
      maxOwner: 100,
      pairs: [
        {
          phone_1: '+995599000005',
          phone_2: '+995599000006',
          co_owners: '4',
          sample_alias: 'Giorgi Potskhveria',
        },
      ],
    });

    const out = await runIdentityScan(1);

    expect(out.candidates_added).toBe(1);
    const candidateInsert = mockQuery.mock.calls.find(([sql]) =>
      (sql as string).includes('INSERT INTO identity_candidates'),
    );
    expect(candidateInsert).toBeDefined();
    // A candidate never writes person_identities on its own — only two
    // person_identities writers exist: the auto-merge and an admin approve.
    const identityWrites = mockQuery.mock.calls.filter(([sql]) =>
      (sql as string).includes('INSERT INTO person_identities'),
    );
    expect(identityWrites).toHaveLength(0);
  });

  it('discovers pairs by GROUPING, never by joining UserAlias to itself', async () => {
    // The scan sat dead for 35 hours (31 Aug 09:37 → 1 Sep 20:30, every cron
    // tick "canceling statement due to statement timeout") because discovery
    // self-joined the table inside each owner: one live phonebook holds 10,736
    // aliases, so that owner alone is ~115M normalize() comparisons. Grouping
    // by (owner, normalized alias) runs the same range in 1.8s. A self-join
    // here must never come back.
    routeScanQueries({ maxOwner: 100 });

    await runIdentityScan(1);

    const discovery = mockQuery.mock.calls.find(([sql]) =>
      (sql as string).includes('MIN(a.alias) AS sample_alias'),
    );
    const sql = discovery?.[0] as string;
    expect(sql).toContain('GROUP BY a."contactId", normalize_search_token(a.alias)');
    expect(sql).not.toMatch(/JOIN\s+"UserAlias"/);
    // A name held by many phones in ONE book is a role word, not a person.
    expect(sql).toContain('HAVING COUNT(DISTINCT a.phone) BETWEEN 2 AND $4');
    expect(discovery?.[1]?.[3]).toBe(20);
  });

  it('walks owner ranges and reports where to resume', async () => {
    routeScanQueries({ maxOwner: 10_000 });

    const out = await runIdentityScan(1);

    expect(out.done).toBe(false);
    expect(out.next_from).toBe(out.owners_scanned.to + 1);

    const last = await runIdentityScan(9_500);
    expect(last.done).toBe(true);
    expect(last.next_from).toBeNull();
  });
});

describe('runIdentityScanTick — the scan drives itself (migration 100)', () => {
  it('resumes from the stored row, runs one batch, persists the new position', async () => {
    mockQuery.mockImplementation((sql: string) => {
      if (sql.includes('FROM identity_scan_progress'))
        return Promise.resolve(rows([{ next_from: 13001, done: false, pair_offset: 0 }]) as never);
      if (sql.includes('HAVING COUNT(*) >= 2')) return Promise.resolve(rows([]) as never);
      if (sql.includes('MAX("contactId")'))
        return Promise.resolve(rows([{ max: 171012 }]) as never);
      if (sql.includes('MIN(a.alias) AS sample_alias')) return Promise.resolve(rows([]) as never);
      return Promise.resolve(rows([]) as never);
    });

    const out = await runIdentityScanTick();

    expect(out.ran).toBe(true);
    expect(out.done).toBe(false);
    const persist = mockQuery.mock.calls.find(([sql]) =>
      (sql as string).includes('UPDATE identity_scan_progress'),
    );
    // Range drained (short page): move the owner window on, offset back to 0.
    expect(persist?.[1]).toEqual([out.next_from, false, 0]);
  });

  it('stays on a range whose page came back FULL, and advances only the offset', async () => {
    // The scan used to take 300 pairs from a range and move past it forever.
    // A live 500-owner range holds 2,354-5,115 pairs — so it was reading
    // 6-13% of each range and calling the range done.
    const fullPage = Array.from({ length: PAIR_CAP_PER_BATCH }, (_, i) => ({
      phone_1: `+99559900${String(i).padStart(4, '0')}`,
      phone_2: `+99559901${String(i).padStart(4, '0')}`,
      sample_alias: 'Giorgi',
    }));
    mockQuery.mockImplementation((sql: string) => {
      if (sql.includes('FROM identity_scan_progress'))
        return Promise.resolve(rows([{ next_from: 5001, done: false, pair_offset: 600 }]) as never);
      if (sql.includes('HAVING COUNT(*) >= 2')) return Promise.resolve(rows([]) as never);
      if (sql.includes('MAX("contactId")'))
        return Promise.resolve(rows([{ max: 171012 }]) as never);
      if (sql.includes('MIN(a.alias) AS sample_alias'))
        return Promise.resolve(rows(fullPage) as never);
      return Promise.resolve(rows([]) as never);
    });

    const out = await runIdentityScanTick();

    expect(out.next_from).toBe(5001);
    const discovery = mockQuery.mock.calls.find(([sql]) =>
      (sql as string).includes('MIN(a.alias) AS sample_alias'),
    );
    // Paging needs a stable order, and it resumes where it stopped.
    expect(discovery?.[0]).toContain('ORDER BY x.p, y.p, g.sample_alias');
    expect(discovery?.[1]?.[4]).toBe(600);
    const persist = mockQuery.mock.calls.find(([sql]) =>
      (sql as string).includes('UPDATE identity_scan_progress'),
    );
    expect(persist?.[1]).toEqual([5001, false, 600 + PAIR_CAP_PER_BATCH]);
  });

  it('never calls itself done while the last range still has pairs', async () => {
    const fullPage = Array.from({ length: PAIR_CAP_PER_BATCH }, () => ({
      phone_1: '+995599000001',
      phone_2: '+995599000002',
      sample_alias: 'Giorgi',
    }));
    mockQuery.mockImplementation((sql: string) => {
      if (sql.includes('FROM identity_scan_progress'))
        return Promise.resolve(rows([{ next_from: 171000, done: false, pair_offset: 0 }]) as never);
      if (sql.includes('HAVING COUNT(*) >= 2')) return Promise.resolve(rows([]) as never);
      if (sql.includes('MAX("contactId")'))
        return Promise.resolve(rows([{ max: 171012 }]) as never);
      if (sql.includes('MIN(a.alias) AS sample_alias'))
        return Promise.resolve(rows(fullPage) as never);
      return Promise.resolve(rows([]) as never);
    });

    const out = await runIdentityScanTick();

    expect(out.done).toBe(false);
    expect(out.next_from).toBe(171000);
  });

  it('is a no-op once the scan is done — the cron can tick forever for free', async () => {
    mockQuery.mockResolvedValue(rows([{ next_from: 171013, done: true }]) as never);

    const out = await runIdentityScanTick();

    expect(out).toEqual({ ran: false, done: true, next_from: null });
    const scans = mockQuery.mock.calls.filter(([sql]) =>
      (sql as string).includes('MAX("contactId")'),
    );
    expect(scans).toHaveLength(0);
  });
});

describe('approve / reject / unmerge — the human half, always logged', () => {
  it('approve gives the phones ONE person_id, reuses an existing one, and logs the prior state', async () => {
    mockQuery.mockImplementation((sql: string) => {
      if (sql.includes('FROM identity_candidates'))
        return Promise.resolve(
          rows([
            { id: 5, phones: ['+995599000005', '+995599000006'], evidence: { signal: 'x' } },
          ]) as never,
        );
      if (sql.includes('SELECT phone, person_id FROM person_identities'))
        return Promise.resolve(
          rows([
            { phone: '+995599000005', person_id: '11111111-1111-1111-1111-111111111111' },
          ]) as never,
        );
      return Promise.resolve(rows([]) as never);
    });

    const out = await approveIdentityCandidate(5, 'admin:167250');

    expect(out.ok).toBe(true);
    // Extends the EXISTING person rather than inventing a rival id.
    expect(out.person_id).toBe('11111111-1111-1111-1111-111111111111');
    const log = mockQuery.mock.calls.find(([sql]) =>
      (sql as string).includes('INSERT INTO person_merge_log'),
    );
    expect(log?.[1]?.[2]).toEqual(['11111111-1111-1111-1111-111111111111']);
    const close = mockQuery.mock.calls.find(([sql]) =>
      (sql as string).includes("status = 'approved'"),
    );
    expect(close?.[1]).toEqual([5, 'admin:167250']);
  });

  it('reject closes a pending candidate and refuses a missing one', async () => {
    mockQuery.mockResolvedValueOnce(rows([], 1) as never);
    expect((await rejectIdentityCandidate(5, 'admin:1')).ok).toBe(true);

    mockQuery.mockResolvedValueOnce(rows([], 0) as never);
    expect((await rejectIdentityCandidate(999, 'admin:1')).ok).toBe(false);
  });

  it('unmerge removes the mapping rows and logs exactly what was removed', async () => {
    mockQuery.mockImplementation((sql: string) => {
      if (sql.includes('DELETE FROM person_identities'))
        return Promise.resolve(
          rows([{ phone: '+995599000005' }, { phone: '+995599000006' }]) as never,
        );
      return Promise.resolve(rows([]) as never);
    });

    const out = await unmergePerson('11111111-1111-1111-1111-111111111111', 'admin:167250');

    expect(out.ok).toBe(true);
    const log = mockQuery.mock.calls.find(([sql]) => (sql as string).includes("'unmerge'"));
    expect(log?.[1]?.[1]).toEqual(['+995599000005', '+995599000006']);
  });
});

describe('name reach — the number that keeps a reviewer from a bad merge', () => {
  beforeEach(() => jest.clearAllMocks());

  it('stores how many phones network-wide carry the name, beside the agreement count', async () => {
    mockQuery.mockImplementation((sql: string) => {
      if (sql.includes('HAVING COUNT(*) >= 2')) return Promise.resolve(rows([]) as never);
      if (sql.includes('MAX("contactId")')) return Promise.resolve(rows([{ max: 100 }]) as never);
      if (sql.includes('MIN(a.alias) AS sample_alias'))
        return Promise.resolve(
          rows([
            { phone_1: '+995599000005', phone_2: '+995599000006', sample_alias: 'Saba' },
          ]) as never,
        );
      if (sql.includes('COUNT(DISTINCT a."contactId") AS co_owners'))
        return Promise.resolve(
          rows([{ phone_1: '+995599000005', phone_2: '+995599000006', co_owners: '79' }]) as never,
        );
      if (sql.includes('COUNT(DISTINCT ua.phone) AS distinct_phones'))
        return Promise.resolve(rows([{ alias: 'Saba', distinct_phones: '3270' }]) as never);
      if (sql.includes('INSERT INTO identity_candidates'))
        return Promise.resolve(rows([{ id: 1 }]) as never);
      return Promise.resolve(rows([]) as never);
    });

    await runIdentityScan(1);

    const insert = mockQuery.mock.calls.find(([sql]) =>
      (sql as string).includes('INSERT INTO identity_candidates'),
    );
    const evidence = JSON.parse(String(insert?.[1]?.[2])) as Record<string, unknown>;
    // 79 people wrote "Saba"; 3,270 phones could BE a Saba. Both, or neither.
    expect(evidence.co_owners).toBe(79);
    expect(evidence.name_distinct_phones).toBe(3270);
  });

  it('asks for the reach of the passing pairs only, once per batch', async () => {
    mockQuery.mockImplementation((sql: string) => {
      if (sql.includes('HAVING COUNT(*) >= 2')) return Promise.resolve(rows([]) as never);
      if (sql.includes('MAX("contactId")')) return Promise.resolve(rows([{ max: 100 }]) as never);
      if (sql.includes('MIN(a.alias) AS sample_alias'))
        return Promise.resolve(
          rows([
            { phone_1: '+995599000005', phone_2: '+995599000006', sample_alias: 'Kept' },
            { phone_1: '+995599000007', phone_2: '+995599000008', sample_alias: 'Dropped' },
          ]) as never,
        );
      if (sql.includes('COUNT(DISTINCT a."contactId") AS co_owners'))
        return Promise.resolve(
          rows([
            { phone_1: '+995599000005', phone_2: '+995599000006', co_owners: '9' },
            { phone_1: '+995599000007', phone_2: '+995599000008', co_owners: '1' },
          ]) as never,
        );
      if (sql.includes('COUNT(DISTINCT ua.phone) AS distinct_phones'))
        return Promise.resolve(rows([{ alias: 'Kept', distinct_phones: '3' }]) as never);
      if (sql.includes('INSERT INTO identity_candidates'))
        return Promise.resolve(rows([{ id: 1 }]) as never);
      return Promise.resolve(rows([]) as never);
    });

    await runIdentityScan(1);

    const reachCalls = mockQuery.mock.calls.filter(([sql]) =>
      (sql as string).includes('COUNT(DISTINCT ua.phone) AS distinct_phones'),
    );
    expect(reachCalls).toHaveLength(1);
    // The pair that failed the co-owner threshold is never asked about.
    expect(reachCalls[0]?.[1]?.[0]).toEqual(['Kept']);
  });

  it('backfills only candidates that lack the number, and reports what is left', async () => {
    mockQuery.mockImplementation((sql: string) => {
      if (sql.includes("evidence->'name_distinct_phones' IS NULL") && sql.includes('SELECT id'))
        return Promise.resolve(rows([{ id: 11, sample_alias: 'Lia' }]) as never);
      if (sql.includes('COUNT(DISTINCT ua.phone) AS distinct_phones'))
        return Promise.resolve(rows([{ alias: 'Lia', distinct_phones: '1467' }]) as never);
      if (sql.includes('SELECT COUNT(*) AS count FROM identity_candidates'))
        return Promise.resolve(rows([{ count: '2315' }]) as never);
      return Promise.resolve(rows([]) as never);
    });

    const out = await backfillCandidateNameReach(200);

    expect(out).toEqual({ checked: 1, stamped: 1, remaining: 2315 });
    const update = mockQuery.mock.calls.find(([sql]) =>
      (sql as string).includes('UPDATE identity_candidates'),
    );
    // One bulk update: parallel arrays of ids and their reach.
    expect(update?.[1]).toEqual([[11], [1467]]);
  });
});

describe('listIdentityCandidates', () => {
  it('returns the page plus the real total', async () => {
    mockQuery.mockImplementation((sql: string) => {
      if (sql.includes('COUNT(*)')) return Promise.resolve(rows([{ count: '321' }]) as never);
      return Promise.resolve(rows([{ id: 1 }]) as never);
    });

    const out = await listIdentityCandidates('pending', 50);

    expect(out.total).toBe(321);
    expect(out.candidates).toHaveLength(1);
  });
});

describe('the review queue the founder actually reads (ticket 9 task 29)', () => {
  it('sorts rarest first when asked, and pages past the first 200', async () => {
    mockQuery.mockResolvedValue({ rows: [], rowCount: 0 } as never);

    await listIdentityCandidates('pending', 200, { sort: 'rarity', offset: 200 });

    const [sql, params] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('name_distinct_phones');
    expect(sql).toContain('ASC NULLS FIRST');
    expect(sql).toContain('OFFSET');
    expect(params).toEqual(['pending', 200, 200]);
  });

  it('filters to one rarity band', async () => {
    mockQuery.mockResolvedValue({ rows: [], rowCount: 0 } as never);

    await listIdentityCandidates('pending', 50, { band: 'rare' });

    const [sql] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('<= 2');
  });

  it('lifts the name, the counts and the band onto the row', async () => {
    // The screen showed „— → — 80%" on 2,316 rows: everything a human needs
    // was inside `evidence` and nothing lifted it out.
    mockQuery.mockResolvedValue({
      rows: [
        {
          id: 3,
          phones: ['+12023400819', '+995511249744'],
          confidence: 0.8,
          evidence: {
            sample_alias: 'Levani Shalamberidze',
            co_owners: 7,
            name_distinct_phones: 9,
          },
          status: 'pending',
          created_at: 'now',
        },
      ],
      rowCount: 1,
    } as never);

    const out = await listIdentityCandidates('pending', 50, {});

    expect(out.candidates[0]).toMatchObject({
      sample_alias: 'Levani Shalamberidze',
      co_owners: 7,
      name_distinct_phones: 9,
      band: 'common',
      looks_like_a_name: true,
    });
  });
});

describe('a label that is not a name (ticket 9 task 29)', () => {
  it.each([
    ['Voice Recorder (don’t forget to merge calls)', 'an app'],
    ['AT&T Service Contacts', 'a carrier'],
    ['Test Referral', 'a test row'],
    ['Aaa Aaa', 'a filler'],
    ['Sg Sg', 'a filler'],
    ['Abo Abo', 'a filler'],
    ['', 'nothing at all'],
  ])('%s is not a name (%s)', (alias) => {
    expect(looksLikeAName(alias)).toBe(false);
  });

  it.each(['Levani Shalamberidze', 'ნინო კახიძე', 'Kato Boxua'])('%s is a name', (alias) => {
    expect(looksLikeAName(alias)).toBe(true);
  });

  it('never rejects them by itself — they are only left out of the export', async () => {
    mockQuery.mockResolvedValue({
      rows: [
        {
          id: 1,
          phones: ['+995111', '+995222'],
          confidence: 0.8,
          evidence: { sample_alias: 'Test Referral', co_owners: 168, name_distinct_phones: 1 },
          status: 'pending',
          created_at: 'now',
        },
        {
          id: 2,
          phones: ['+995333', '+995444'],
          confidence: 0.8,
          evidence: { sample_alias: 'Nino Kakhidze', co_owners: 4, name_distinct_phones: 1 },
          status: 'pending',
          created_at: 'now',
        },
      ],
      rowCount: 2,
    } as never);

    const out = await exportIdentityCandidates(true);

    expect(out.rows.map((r) => r.id)).toEqual([2]);
    expect(out.skipped_not_a_name).toBe(1);
    expect(out.total_pending).toBe(2);
    // The numbers leave as last-four only — a review list is not a place to
    // publish 4,632 phone numbers.
    expect(out.rows[0].number_1).toBe('…5333');
  });
});

describe('loading the founder’s answers back (ticket 9 task 29)', () => {
  it('an unsure answer stays PENDING — it is not a decision', async () => {
    const out = await applyIdentityDecisions(
      [
        { id: 1, decision: 'unsure' },
        { id: 2, decision: '' },
      ],
      'admin:1',
    );

    expect(out).toEqual({ approved: 0, rejected: 0, skipped: 2, errors: [] });
  });
});
