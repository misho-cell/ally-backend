jest.mock('../../db/postgres/client', () => ({ __esModule: true, query: jest.fn() }));
jest.mock('../mcp/contactRef', () => ({
  __esModule: true,
  decodeContactRef: jest.fn((_owner: string, ref: string) =>
    ref === 'c_m' ? '+995599000001' : null,
  ),
}));
jest.mock('../tools/membership', () => ({
  __esModule: true,
  fetchAccountStates: jest.fn(() => Promise.resolve(new Map())),
  accountDetailsFor: jest.fn(() => ({ state: 'netai_user', user_id: 77 })),
}));

import { query } from '../../db/postgres/client';
import { accountDetailsFor } from '../tools/membership';
import { areasOf, memberCardFor } from '../memberCard.service';

const mockQuery = query as jest.MockedFunction<typeof query>;

function reads(hideWork: boolean, hideTags: boolean): void {
  mockQuery.mockImplementation(((sql: string) => {
    if (sql.includes('FROM "User"'))
      return Promise.resolve({
        rows: [
          {
            name: 'ნინო ბერიძე',
            job: 'ბუღალტერი',
            employer: 'TBC',
            city: null,
            hide_work: hideWork,
            hide_tags: hideTags,
          },
        ],
      });
    if (sql.includes('user_profile_kv'))
      return Promise.resolve({
        rows: [
          { key: 'city', value: 'თბილისი' },
          { key: 'industry', value: 'ფინანსები, ბანკები' },
          { key: 'interests', value: 'ჭადრაკი' },
        ],
      });
    return Promise.resolve({ rows: [{ text: 'ბუღალტრული კონსულტაცია' }] });
  }) as never);
}

/** The frontend's item 9, the member card (§127: „ფრონტის სია"). */
describe('the member card', () => {
  beforeEach(() => mockQuery.mockReset());

  it('carries name, role · company, city, areas and what they are open to', async () => {
    reads(false, false);
    await expect(memberCardFor(171, 'c_m')).resolves.toEqual({
      id: 'c_m',
      name: 'ნინო ბერიძე',
      role: 'ბუღალტერი',
      company: 'TBC',
      city: 'თბილისი',
      areas: ['ფინანსები', 'ბანკები', 'ჭადრაკი'],
      open_to: ['ბუღალტრული კონსულტაცია'],
    });
  });

  it('keeps hidden what the member hid: work, and areas with offers', async () => {
    reads(true, true);
    await expect(memberCardFor(171, 'c_m')).resolves.toMatchObject({
      role: null,
      company: null,
      areas: [],
      open_to: [],
      city: 'თბილისი',
    });
  });

  it('is null for a foreign id or a person who is not a member', async () => {
    await expect(memberCardFor(171, 'c_other')).resolves.toBeNull();
    (accountDetailsFor as jest.Mock).mockReturnValueOnce({ state: 'none', user_id: null });
    await expect(memberCardFor(171, 'c_m')).resolves.toBeNull();
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('reads the areas once each, in the order written', () => {
    expect(
      areasOf(
        new Map([
          ['industry', 'IT; IT'],
          ['interests', 'ფეხბურთი'],
        ]),
      ),
    ).toEqual(['IT', 'ფეხბურთი']);
  });
});
