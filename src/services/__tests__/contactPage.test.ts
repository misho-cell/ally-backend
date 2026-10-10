jest.mock('../../db/postgres/client', () => ({ __esModule: true, query: jest.fn() }));
jest.mock('../tools/membership', () => ({
  __esModule: true,
  fetchAccountStates: jest.fn(() => Promise.resolve(new Map())),
  isMemberPhone: jest.fn(() => true),
}));
jest.mock('../mcp/contactRef', () => ({
  __esModule: true,
  decodeContactRef: jest.fn((_user: string, ref: string) =>
    ref === 'c_mine' ? '+995599000001' : null,
  ),
}));

import { query } from '../../db/postgres/client';
import { contactPageFor, roleFrom, Warmth } from '../contactPage.service';

const mockQuery = query as jest.MockedFunction<typeof query>;

beforeEach(() => mockQuery.mockReset());

/** Answers the page's reads in the order they are made. */
function pageReads(warm: boolean, distant: boolean, alias = 'ნინო'): void {
  mockQuery.mockImplementation((sql: string) => {
    if (sql.includes('FROM "UserAlias"')) return Promise.resolve({ rows: [{ alias }] });
    if (sql.includes('FROM "UserTags"'))
      return Promise.resolve({ rows: [{ tag: 'ბუღალტერი' }, { tag: '12345' }] });
    if (sql.includes('AS warm')) return Promise.resolve({ rows: [{ warm, distant }] });
    if (sql.includes('FROM contact_facts') && sql.includes('source = $2'))
      return Promise.resolve({
        rows: [
          {
            field: 'employer',
            value: 'TBC Bank',
            source_url: 'https://example.ge/team',
            fact_date: '2026-05-01',
          },
        ],
      });
    if (sql.includes('FROM contact_facts'))
      return Promise.resolve({
        rows: [
          { field: 'employer', value: 'TBC', saved_at: '2026-09-01' },
          { field: 'occupation', value: 'ბუღალტერი', saved_at: '2026-09-01' },
        ],
      });
    if (sql.includes('FROM contact_exclusions'))
      return Promise.resolve({ rows: [{ excluded_for: 'office in Rustavi', reason: null }] });
    return Promise.resolve({ rows: [] });
  }) as never;
}

/** The frontend's 06:30Z item 4: the person's own page about one contact. */
describe('contactPageFor', () => {
  it('gathers only the person’s own labels, facts, closeness and exclusions', async () => {
    pageReads(true, false);
    const page = await contactPageFor(171, 'c_mine');
    expect(page).toEqual({
      id: 'c_mine',
      name: 'ნინო',
      saved_as: null,
      role: 'ბუღალტერი · TBC',
      on_netai: true,
      labels: ['ბუღალტერი'],
      warmth: Warmth.Warm,
      facts: expect.any(Array),
      public_facts: [
        {
          field: 'employer',
          value: 'TBC Bank',
          source_url: 'https://example.ge/team',
          fact_date: '2026-05-01',
        },
      ],
      exclusions: [{ excluded_for: 'office in Rustavi', reason: null }],
    });
    const sqls = mockQuery.mock.calls.map(([sql]) => String(sql));
    expect(sqls.some((sql) => sql.includes('ask_boundaries'))).toBe(false);
    expect(sqls.find((sql) => sql.includes('submitted_by_user_id'))).toContain(
      'submitted_by_user_id = $2',
    );
    // D773: the public part is the research load only, never another member's saved facts.
    const publicSql = sqls.find((sql) => sql.includes('source = $2')) ?? '';
    expect(publicSql).toContain('retracted_at IS NULL');
    expect(publicSql).not.toContain('submitted_by_user_id');
  });

  /** 4390 (box 51286): the list showed „💙" as saved_as and the page showed nothing. */
  it('carries a label with no letter as saved_as, as the list row does', async () => {
    pageReads(true, false, '💙');
    await expect(contactPageFor(171, 'c_mine')).resolves.toMatchObject({
      name: null,
      saved_as: '💙',
    });
  });

  it('reads red as distant and no confirmed tie as neutral', async () => {
    pageReads(false, true);
    await expect(contactPageFor(171, 'c_mine')).resolves.toMatchObject({ warmth: Warmth.Distant });
    pageReads(false, false);
    await expect(contactPageFor(171, 'c_mine')).resolves.toMatchObject({ warmth: Warmth.Neutral });
  });

  it('is null for a foreign id, or a number not in this phonebook', async () => {
    await expect(contactPageFor(171, 'c_someone_elses')).resolves.toBeNull();
    mockQuery.mockResolvedValue({ rows: [] } as never);
    await expect(contactPageFor(171, 'c_mine')).resolves.toBeNull();
  });
});

describe('roleFrom', () => {
  it('joins occupation and employer, and is null without either', () => {
    expect(roleFrom([{ field: 'occupation', value: 'ექიმი', saved_at: '' }])).toBe('ექიმი');
    expect(roleFrom([{ field: 'city', value: 'თბილისი', saved_at: '' }])).toBeNull();
  });
});
