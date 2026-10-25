const mockQuery = jest.fn();
jest.mock('../../../db/postgres/client', () => ({
  __esModule: true,
  query: (...a: unknown[]) => mockQuery(...a),
}));

import { readFileSync } from 'fs';
import { join } from 'path';
import { holdersOnly, ownerHolderPhones, ownerHolderPhonesOrNone } from '../ownerHolders';

const OWNER = '+995555000001';
const HOLDER = '+995555000777';
const FRIEND = '+995555000222';

beforeEach(() => jest.resetAllMocks());

/** #7826 (thread 63460): a member who has the owner saved is a route into their phonebook. */
describe('every member who holds the owner is a route', () => {
  it('reads the members who saved one of the owner’s numbers, never the owner himself', async () => {
    mockQuery.mockResolvedValue({ rows: [{ phone: HOLDER }] });
    expect(await ownerHolderPhones('7', [OWNER])).toEqual([HOLDER]);
    const [sql, params, timeout] = mockQuery.mock.calls[0] as [string, unknown[], number];
    expect(sql).toContain('ua.phone = ANY($2::text[]) AND ua."contactId" <> $1::int');
    expect(sql).toContain('search_activity');
    expect(params).toEqual(['7', [OWNER], expect.any(Number)]);
    expect(timeout).toBeGreaterThan(0);
  });

  it('marks only the holders the owner has not saved himself', () => {
    expect([...holdersOnly([HOLDER, FRIEND], ['+995 555 000 222'])]).toEqual(['995555000777']);
  });

  it('reads nothing without the owner’s numbers, and a failed read gives no holders', async () => {
    expect(await ownerHolderPhones('7', [])).toEqual([]);
    expect(mockQuery).not.toHaveBeenCalled();
    mockQuery.mockRejectedValue(new Error('timeout'));
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(await ownerHolderPhonesOrNone('7', [OWNER])).toEqual([]);
  });

  it('feeds the second circle and marks those bridges holds_you', () => {
    const code = readFileSync(join(__dirname, '..', 'searchSecondDegree.ts'), 'utf8');
    expect(code).toContain(
      'const holderPhones = await ownerHolderPhonesOrNone(userId, userPhones);',
    );
    expect(code).toContain('holds_you: true');
  });
});
