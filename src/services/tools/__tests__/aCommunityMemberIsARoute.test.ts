jest.mock('../../../db/postgres/client', () => ({ __esModule: true, query: jest.fn() }));

import { query } from '../../../db/postgres/client';
import { holdersOnly, ownerCommunityPhones, ownerCommunityPhonesOrNone } from '../ownerHolders';

/**
 * #7826 (c): the members of the owner's own communities are routes in the
 * second circle, like the members who hold him — current members only.
 */
const mockQuery = query as jest.MockedFunction<typeof query>;

beforeEach(() => jest.clearAllMocks());

describe('the owner’s community as routes (#7826)', () => {
  it('reads only current members of the owner’s own communities who use Netai', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ phone: '+995500000201' }], rowCount: 1 } as never);
    await expect(ownerCommunityPhones('171', ['+995500000101'])).resolves.toEqual([
      '+995500000201',
    ]);
    const [sql, params] = mockQuery.mock.calls[0];
    expect(String(sql)).toContain("theirs.field_type = 'member_of'");
    expect(String(sql)).toContain("mine.field_type = 'member_of'");
    expect(String(sql)).toContain('theirs.value = mine.value');
    expect(String(sql)).not.toContain('affiliation');
    expect(params).toEqual(['171', ['+995500000101'], 300]);
  });

  it('reads nothing for an owner with no number, and degrades to none on a failed read', async () => {
    await expect(ownerCommunityPhones('171', [])).resolves.toEqual([]);
    expect(mockQuery).not.toHaveBeenCalled();
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    mockQuery.mockRejectedValueOnce(new Error('timeout'));
    await expect(ownerCommunityPhonesOrNone('171', ['+995500000101'])).resolves.toEqual([]);
  });

  it('marks as community only the members reached that way, not the owner’s own contacts or holders', () => {
    const marked = holdersOnly(
      ['+995500000201', '+995500000202'],
      ['+995500000202', '+995500000301'],
    );
    expect([...marked]).toEqual(['995500000201']);
  });
});
