jest.mock('../../../db/postgres/client', () => ({ __esModule: true, query: jest.fn() }));

import { query } from '../../../db/postgres/client';
import {
  COMMUNITIES_NOTE,
  CommunityStatus,
  communitiesByPhone,
  withCommunities,
} from '../communities';

/**
 * #7758 (tester 79008/79009; the founder, 30 Oct): an ex-Axel member came back
 * from the name search with no sign that he had left, and the community was
 * called his likely employer. A found person's groups now say current or former.
 */
const mockQuery = query as jest.MockedFunction<typeof query>;
const rows = (r: unknown[]): never => ({ rows: r, rowCount: r.length }) as never;

beforeEach(() => mockQuery.mockReset());

describe('a found person’s communities', () => {
  it('are current for a live membership and former for the roster’s former mark', () => {
    const groups = communitiesByPhone([
      { phone: '+1', field_type: 'member_of', value: 'CELA' },
      { phone: '+1', field_type: 'affiliation', value: 'Axel (former member)' },
    ]);
    expect(groups.get('+1')).toEqual([
      { name: 'CELA', status: CommunityStatus.Current },
      { name: 'Axel', status: CommunityStatus.Former },
    ]);
  });

  it('take a live membership over a former mark of the same group', () => {
    const groups = communitiesByPhone([
      { phone: '+1', field_type: 'affiliation', value: 'Axel (former member)' },
      { phone: '+1', field_type: 'member_of', value: 'Axel' },
    ]);
    expect(groups.get('+1')).toEqual([{ name: 'Axel', status: CommunityStatus.Current }]);
  });

  it('ride with the name search’s rows, with the note that a community is not an employer', async () => {
    mockQuery.mockResolvedValueOnce(
      rows([{ phone: '+1', field_type: 'affiliation', value: 'Axel (former member)' }]),
    );
    const out = (await withCommunities({
      found: true,
      results: [{ phone: '+1' }, { phone: '+2' }],
    })) as {
      results: { communities?: unknown }[];
      communities_note?: string;
    };
    expect(out.results[0].communities).toEqual([{ name: 'Axel', status: CommunityStatus.Former }]);
    expect(out.results[1].communities).toBeUndefined();
    expect(out.communities_note).toBe(COMMUNITIES_NOTE);
    expect(COMMUNITIES_NOTE).toContain('never an employer');
  });

  it('leave the result untouched when nobody belongs to a group, or the read fails', async () => {
    const found = { found: true, results: [{ phone: '+1' }] };
    mockQuery.mockResolvedValueOnce(rows([]));
    expect(await withCommunities(found)).toBe(found);
    mockQuery.mockRejectedValueOnce(new Error('timeout'));
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(await withCommunities(found)).toBe(found);
  });
});
