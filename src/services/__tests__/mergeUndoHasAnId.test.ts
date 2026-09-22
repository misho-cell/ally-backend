jest.mock('../../db/postgres/client', () => ({ query: jest.fn(), __esModule: true }));

import { query } from '../../db/postgres/client';
import { applyIdentityDecisions, listIdentityCandidates } from '../identity.service';

const mockQuery = query as jest.MockedFunction<typeof query>;

const rows = (data: unknown[]): { rows: unknown[]; rowCount: number } => ({
  rows: data,
  rowCount: data.length,
});

beforeEach(() => jest.clearAllMocks());

/**
 * ROW 236 — the undo on an approved merge asked the reviewer to type a person
 * id, and the screen had no way to know one.
 *
 * Misho's read was that the button calls the server without the id „and the
 * server had already handed that id back when the pair was approved". That is
 * true of `POST /admin/identity/candidates/:id/approve`, which returns
 * `person_id`. It is NOT true of the route the review page actually posts to.
 *
 * `applyIdentityDecisions` called `approveIdentityCandidate`, took its `ok`,
 * and THREW THE person_id AWAY, answering with three counts. And the listing
 * never carried one either. So for a pair approved in bulk — every pair on
 * that page — there was no id anywhere the frontend could reach, whatever the
 * button did.
 *
 * The row is filed „(Frontend.)" and whose-move Misho. The frontend half is
 * real; it could not have worked on its own.
 */
describe('a bulk approval says which person it merged', () => {
  function approving(personId: string): void {
    mockQuery.mockImplementation((sql: string) => {
      const text = String(sql);
      // The candidate being approved.
      if (text.includes('FROM identity_candidates') && text.includes('status'))
        return Promise.resolve(rows([{ id: 7, phones: ['+995555111222'], evidence: {} }]) as never);
      if (text.includes('FROM person_identities'))
        return Promise.resolve(rows([{ phone: '+995555111222', person_id: personId }]) as never);
      return Promise.resolve(rows([]) as never);
    });
  }

  it('returns the merged person beside the counts, not instead of them', async () => {
    approving('p-1234');

    const out = await applyIdentityDecisions([{ id: 7, decision: 'yes' }], 'admin:1');

    expect(out.approved).toBe(1);
    expect(out.merged).toEqual([{ id: 7, person_id: 'p-1234' }]);
  });

  it('names nobody for a rejection — there is no merged person to name', async () => {
    mockQuery.mockResolvedValue(rows([{ id: 8 }]) as never);

    const out = await applyIdentityDecisions([{ id: 8, decision: 'no' }], 'admin:1');

    expect(out.rejected).toBe(1);
    expect(out.merged).toEqual([]);
  });

  it('names nobody for a pair the reviewer was unsure about', async () => {
    const out = await applyIdentityDecisions([{ id: 9, decision: 'maybe' }], 'admin:1');

    expect(out.skipped).toBe(1);
    expect(out.merged).toEqual([]);
    expect(mockQuery).not.toHaveBeenCalled();
  });
});

/**
 * And for every pair approved BEFORE today, which is the case the seat
 * actually hit: the listing carries the id so the button works on history too.
 */
describe('the listing carries the merged person on an approved row', () => {
  function listing(status: string): void {
    mockQuery.mockImplementation((sql: string) => {
      const text = String(sql);
      if (text.includes('COUNT(*)')) return Promise.resolve(rows([{ count: '1' }]) as never);
      return Promise.resolve(
        rows([
          {
            id: 7,
            phones: ['+995555111222'],
            confidence: 0.9,
            evidence: { sample_alias: 'ნინო კახიძე', name_distinct_phones: 2 },
            status,
            created_at: '2026-09-22T00:00:00Z',
            ...(status === 'approved' ? { person_id: 'p-1234' } : {}),
          },
        ]) as never,
      );
    });
  }

  it('asks the database for it, and only for an approved row', async () => {
    listing('approved');

    await listIdentityCandidates('approved', 10, {});

    const page = mockQuery.mock.calls.map((c) => String(c[0])).find((s) => s.includes('person_id'));
    expect(page).toBeDefined();
    // The pending queue is the hot read on this page; a correlated lookup per
    // row must not be paid there, for rows with no merged person to name.
    expect(page).toContain("CASE WHEN status = 'approved'");
  });

  it('hands it through to the row the screen reads', async () => {
    listing('approved');

    const out = await listIdentityCandidates('approved', 10, {});

    expect(out.candidates[0]).toMatchObject({ id: 7, person_id: 'p-1234' });
  });

  /**
   * Absent, not null. „This pair was never merged" and „it was merged and we
   * cannot say to whom" are different answers, and a null would say the second
   * while meaning the first.
   */
  it('leaves the key off a pending row rather than nulling it', async () => {
    listing('pending');

    const out = await listIdentityCandidates('pending', 10, {});

    expect('person_id' in out.candidates[0]).toBe(false);
  });
});
