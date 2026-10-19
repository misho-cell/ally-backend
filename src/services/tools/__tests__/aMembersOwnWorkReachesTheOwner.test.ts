import { readFileSync } from 'fs';
import { join } from 'path';
jest.mock('../../../db/postgres/client', () => ({ __esModule: true, query: jest.fn() }));
jest.mock('../../insights.service', () => ({
  __esModule: true,
  getContactInsight: jest.fn(() => Promise.resolve(null)),
}));
jest.mock('../../contactFacts.service', () => ({
  __esModule: true,
  getVisibleFacts: jest.fn(() => Promise.resolve({ facts: [] })),
}));
jest.mock('../likelyEmployer', () => ({
  __esModule: true,
  likelyEmployerFor: jest.fn(() => Promise.resolve({})),
}));
jest.mock('../membership', () => ({
  __esModule: true,
  fetchAccountStates: jest.fn(() => Promise.resolve(new Map())),
  accountDetailsFor: jest.fn(),
  accountStateFor: jest.fn(() => 'netai_user'),
  isMemberPhone: jest.fn(() => true),
  isSubscriberPhone: jest.fn(() => false),
}));

import { query } from '../../../db/postgres/client';
import { accountDetailsFor } from '../membership';
import {
  contactsYouBothHave,
  getContactFullProfile,
  withContactsWhoKnowThem,
} from '../getContactFullProfile';

const mockQuery = query as jest.MockedFunction<typeof query>;
const mockDetails = accountDetailsFor as jest.MockedFunction<typeof accountDetailsFor>;

const MEMBER_ID = 77;
const PHONE = '+995599000001';

interface Reads {
  readonly hideWork?: boolean;
  readonly profile?: ReadonlyArray<{ key: string; value: string }>;
  readonly failWork?: boolean;
}

/** World M (the tester's 68815): the notary told his own Netai what he does. */
function reads({ hideWork = false, profile, failWork = false }: Reads): void {
  mockQuery.mockImplementation(((sql: string) => {
    if (sql.includes('FROM "UserTags"')) return Promise.resolve({ rows: [] });
    if (failWork) return Promise.reject(new Error('timeout'));
    if (sql.includes('FROM "User"')) {
      return Promise.resolve({
        rows: [
          {
            name: 'გურამ',
            job: null,
            employer: null,
            city: null,
            hide_work: hideWork,
            hide_tags: false,
          },
        ],
      });
    }
    if (sql.includes('user_profile_kv')) {
      return Promise.resolve({
        rows: profile ?? [
          { key: 'profession', value: 'ნოტარიუსი' },
          { key: 'industry', value: 'ნოტარიული მომსახურება' },
        ],
      });
    }
    return Promise.resolve({ rows: [] });
  }) as never);
}

describe('#5941: what a member said about their own work reaches the owner who asks about them', () => {
  beforeEach(() => {
    mockQuery.mockReset();
    mockDetails.mockReturnValue({
      state: 'netai_user',
      user_id: MEMBER_ID,
      netai_subscriber: false,
      old_ally_paid: false,
      staff: false,
    });
  });

  it('carries the member’s own role and areas on the contact card', async () => {
    reads({});
    const card = await getContactFullProfile('171', PHONE);
    expect(card.member_says_about_own_work).toEqual({
      role: 'ნოტარიუსი',
      company: null,
      city: null,
      areas: ['ნოტარიული მომსახურება'],
    });
  });

  it('keeps the work the member hid hidden', async () => {
    reads({ hideWork: true });
    const card = await getContactFullProfile('171', PHONE);
    expect(card.member_says_about_own_work).toEqual({
      role: null,
      company: null,
      city: null,
      areas: ['ნოტარიული მომსახურება'],
    });
  });

  it('adds nothing when the member said nothing', async () => {
    reads({ profile: [] });
    const card = await getContactFullProfile('171', PHONE);
    expect(card).not.toHaveProperty('member_says_about_own_work');
  });

  it('adds nothing for a person who is not on Netai, without reading anyone’s profile', async () => {
    mockDetails.mockReturnValue({
      state: 'none',
      user_id: null,
      netai_subscriber: false,
      old_ally_paid: false,
      staff: false,
    });
    reads({});
    const card = await getContactFullProfile('171', PHONE);
    expect(card).not.toHaveProperty('member_says_about_own_work');
    expect(mockQuery.mock.calls.some(([sql]) => String(sql).includes('user_profile_kv'))).toBe(
      false,
    );
  });

  it('leaves the card as it was when the member’s work cannot be read', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    reads({ failWork: true });
    const card = await getContactFullProfile('171', PHONE);
    expect(card).not.toHaveProperty('member_says_about_own_work');
    expect(card.is_member).toBe(true);
    warn.mockRestore();
  });
});

describe('#5941: the name search carries the member’s own profession', () => {
  it('reads it in both of its queries, behind the member’s hide flag', () => {
    const byName = readFileSync(join(__dirname, '..', 'searchContactByName.ts'), 'utf8');
    expect(byName.match(/\$\{OWN_JOB\} AS "jobPosition"/g)).toHaveLength(2);
    expect(byName.match(/\$\{OWN_PROFESSION_JOIN\}/g)).toHaveLength(2);
    expect(byName).toContain(`FILTER (WHERE u."hideUserWorkInfo" IS NOT TRUE)`);
  });
});

describe('#5974 (68872): the owner’s own contacts who also know this person', () => {
  beforeEach(() => mockQuery.mockReset());

  it('names them by the owner’s own names, never by how they saved her', async () => {
    mockDetails.mockReturnValue({
      state: 'none',
      user_id: null,
      netai_subscriber: false,
      old_ally_paid: false,
      staff: false,
    });
    mockQuery.mockImplementation(((sql: string) =>
      Promise.resolve({
        rows: sql.includes('theirs') ? [{ name: 'ზურა' }, { name: 'ლიკა' }, { name: '599' }] : [],
      })) as never);
    const card = await getContactFullProfile('171', PHONE);
    expect(card.your_contacts_who_know_them).toEqual(['ზურა', 'ლიკა']);
    const sql = String(mockQuery.mock.calls.find(([q]) => String(q).includes('theirs'))?.[0]);
    expect(sql).toContain('own."contactId" = $1::int');
    expect(sql).not.toContain('theirs.alias');
  });

  it('adds nothing when nobody else has them, or the read fails', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    mockQuery.mockImplementation(((sql: string) =>
      sql.includes('theirs')
        ? Promise.reject(new Error('timeout'))
        : Promise.resolve({ rows: [] })) as never);
    const card = await getContactFullProfile('171', PHONE);
    expect(card).not.toHaveProperty('your_contacts_who_know_them');
    warn.mockRestore();
  });
});

describe('#5974 (68996): a name search carries who else of the owner’s knows them', () => {
  beforeEach(() => mockQuery.mockReset());

  it('adds the owner’s own contacts to the first rows, by the owner’s names', async () => {
    mockQuery.mockImplementation(((sql: string) =>
      Promise.resolve({
        rows: String(sql).includes('FROM "UserPhone" up')
          ? []
          : [{ name: 'ზურა' }, { name: 'ლიკა' }],
      })) as never);
    const out = await withContactsWhoKnowThem('171', {
      found: true,
      results: [{ name: 'ნანა', phone: PHONE }],
    });
    expect(out.results[0]).toEqual({
      name: 'ნანა',
      phone: PHONE,
      your_contacts_who_know_them: ['ზურა', 'ლიკა'],
    });
  });

  it('reads at most three rows and leaves an empty result as it was', async () => {
    mockQuery.mockResolvedValue({ rows: [] } as never);
    const many = { results: [1, 2, 3, 4, 5].map((i) => ({ name: `n${i}`, phone: `p${i}` })) };
    await withContactsWhoKnowThem('171', many);
    // Two reads per row (who else knows them, and what the two books share), three rows.
    expect(mockQuery).toHaveBeenCalledTimes(6);
    const none = { found: false };
    expect(await withContactsWhoKnowThem('171', none)).toBe(none);
  });

  it('is wired into search_contact_by_name', () => {
    const chat = readFileSync(join(__dirname, '..', '..', 'chat.service.ts'), 'utf8');
    expect(chat).toContain('await withContactsWhoKnowThem(userId, byName)');
  });
});

describe('#5974 (69079, 69126): the contacts the owner and a member both have', () => {
  beforeEach(() => mockQuery.mockReset());

  it('names them by the owner’s own names, from the member’s book', async () => {
    mockQuery.mockResolvedValue({ rows: [{ name: 'ზაზა ბერიძე' }, { name: 'მარი' }] } as never);

    expect(await contactsYouBothHave('171', PHONE)).toEqual({
      contacts_you_both_have: ['ზაზა ბერიძე', 'მარი'],
    });
    const [sql, params] = mockQuery.mock.calls[0];
    expect(String(sql)).toContain('JOIN "UserAlias" theirs ON theirs."contactId" = up."userId"');
    expect(String(sql)).toContain('TRIM(own.alias)');
    expect(String(sql)).not.toContain('theirs.alias');
    expect(params?.[0]).toBe('171');
  });

  it('adds nothing for a non-member or a failed read', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] } as never);
    expect(await contactsYouBothHave('171', PHONE)).toEqual({});
    mockQuery.mockRejectedValueOnce(new Error('timeout'));
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect(await contactsYouBothHave('171', PHONE)).toEqual({});
  });

  it('rides on the name search beside who else knows them', async () => {
    mockQuery.mockImplementation(((sql: string) =>
      Promise.resolve({
        rows: String(sql).includes('FROM "UserPhone" up') ? [{ name: 'მარი' }] : [],
      })) as never);
    const out = await withContactsWhoKnowThem('171', { results: [{ name: 'ნიკა', phone: PHONE }] });
    expect(out.results[0]).toEqual({
      name: 'ნიკა',
      phone: PHONE,
      contacts_you_both_have: ['მარი'],
    });
  });
});
