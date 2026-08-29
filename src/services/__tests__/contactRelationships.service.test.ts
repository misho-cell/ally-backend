jest.mock('../../db/postgres/client', () => ({ query: jest.fn(), __esModule: true }));

import { query } from '../../db/postgres/client';
import {
  saveContactRelationship,
  forgetContactRelationship,
  listOwnRelationships,
  relationshipTouchedPhones,
  applyRelationshipWarmth,
} from '../contactRelationships.service';

const mockQuery = query as jest.MockedFunction<typeof query>;

function rows(data: unknown[], rowCount = data.length): { rows: unknown[]; rowCount: number } {
  return { rows: data, rowCount };
}

beforeEach(() => jest.clearAllMocks());

describe('saveContactRelationship — D34: stored, never spoken', () => {
  it('stores ONE ordered pair whichever order it was said in, relation lowercased', async () => {
    mockQuery.mockResolvedValue(rows([{ id: 1 }]) as never);

    const out = await saveContactRelationship('42', '+995599000002', '+995599000001', 'Brother');

    expect(out).toEqual({ saved: true });
    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql as string).toContain('INSERT INTO contact_relationships');
    // Ordered: a < b regardless of argument order; relation normalized.
    expect(params).toEqual(['42', '+995599000001', '+995599000002', 'brother']);
  });

  it('the identical tie already saved is success, not an error (idempotent)', async () => {
    mockQuery.mockResolvedValue(rows([]) as never);

    const out = await saveContactRelationship('42', '+995599000001', '+995599000002', 'brother');

    expect(out).toEqual({ saved: true, already: true });
  });

  it('refuses the same phone twice and an empty relation, before touching the database', async () => {
    expect(
      (await saveContactRelationship('42', '+995599000001', '+995599000001', 'brother')).saved,
    ).toBe(false);
    expect(
      (await saveContactRelationship('42', '+995599000001', '+995599000002', '  ')).saved,
    ).toBe(false);
    expect(mockQuery).not.toHaveBeenCalled();
  });
});

describe('forgetContactRelationship', () => {
  it('removes one named tie, or every tie for the pair when relation is omitted', async () => {
    mockQuery.mockResolvedValue(rows([], 2) as never);

    const out = await forgetContactRelationship('42', '+995599000002', '+995599000001');

    expect(out).toEqual({ removed: 2 });
    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql as string).toContain('DELETE FROM contact_relationships');
    expect(sql as string).not.toContain('relation =');
    expect(params).toEqual(['42', '+995599000001', '+995599000002']);
  });
});

describe('listOwnRelationships — the owner reads their OWN records back', () => {
  it('scopes to the owning user, optionally filtered to one contact', async () => {
    mockQuery.mockResolvedValue(rows([]) as never);

    await listOwnRelationships('42', '+995599000001');

    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql as string).toContain('user_id = $1::int');
    expect(params).toEqual(['42', '+995599000001']);
  });
});

describe('relationshipTouchedPhones — the ranking read: membership only, the relation text never leaves', () => {
  it('returns the touched phones and nothing else', async () => {
    mockQuery.mockResolvedValue(rows([{ phone: '+995599000001' }]) as never);

    const out = await relationshipTouchedPhones('42', ['+995599000001', '+995599000009']);

    expect(out).toEqual(new Set(['+995599000001']));
    // The query must not select the relation column at all — membership only.
    const sql = mockQuery.mock.calls[0][0] as string;
    expect(sql).toContain('SELECT p.phone');
    expect(sql).not.toContain('cr.relation');
  });

  it('fails soft — ranking never breaks on this store', async () => {
    mockQuery.mockRejectedValue(new Error('db down'));

    expect(await relationshipTouchedPhones('42', ['+995599000001'])).toEqual(new Set());
  });
});

describe('applyRelationshipWarmth — one formula for every ranking caller', () => {
  it('lifts an existing warmth by the bonus, capped', () => {
    expect(applyRelationshipWarmth(0.5)).toBeCloseTo(0.7, 5);
    expect(applyRelationshipWarmth(0.9)).toBeCloseTo(0.95, 5);
  });

  it('gives the baseline + bonus when no warmth was computed at all', () => {
    expect(applyRelationshipWarmth(null)).toBeCloseTo(0.5, 5);
    expect(applyRelationshipWarmth(undefined)).toBeCloseTo(0.5, 5);
  });
});
