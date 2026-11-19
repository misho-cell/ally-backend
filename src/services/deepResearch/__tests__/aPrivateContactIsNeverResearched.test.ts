const mockQuery = jest.fn();
jest.mock('../../../db/postgres/client', () => ({
  __esModule: true,
  query: (...a: unknown[]) => mockQuery(...a),
}));

import { SubjectKind } from '../deepResearch.types';
import {
  APPROVED_LISTS,
  BaseRecord,
  SubjectRefusal,
  nameSpellings,
  researchSubject,
  subjectFrom,
} from '../researchSubject';

const PHONE = '+995599000001';
const ACCOUNT = {
  name: 'Nino Beridze',
  job: 'Head of Sales',
  employer: 'Colibri',
  city: 'Tbilisi',
  joined: true,
};
const HEAD = { name_ka: 'ლევან ჯაფარიძე', name_latin: 'Levan Japaridze', role: 'Director' };
const NOTHING: BaseRecord = { account: null, heads: [], companies: [], listed: false };

beforeEach(() => mockQuery.mockReset());

/** Misho, 19 Nov: Netai members, public office-holders and his own list — never a private contact. */
describe('a private contact is never researched', () => {
  it('refuses a number that is neither a member, a public head nor on Misho’s list', () => {
    expect(subjectFrom(PHONE, { ...NOTHING, companies: ['Colibri'] })).toBe(
      SubjectRefusal.PrivateContact,
    );
  });

  it('refuses a legacy account that never joined Netai', () => {
    const legacy = { ...NOTHING, account: { ...ACCOUNT, joined: false } };
    expect(subjectFrom(PHONE, legacy)).toBe(SubjectRefusal.PrivateContact);
  });

  it('researches a Netai member on their own profile, in both alphabets', () => {
    const subject = subjectFrom(PHONE, {
      ...NOTHING,
      account: ACCOUNT,
      companies: ['Colibri', 'Lomidze & Co'],
    });
    expect(subject).toEqual({
      phone: PHONE,
      kind: SubjectKind.Member,
      names: ['Nino Beridze', expect.stringMatching(/\p{Script=Georgian}/u)],
      companies: ['Colibri', 'Lomidze & Co'],
      role: 'Head of Sales',
      city: 'Tbilisi',
    });
  });

  it('researches a public head on the role the register names', () => {
    const subject = subjectFrom(PHONE, {
      ...NOTHING,
      heads: [HEAD],
      companies: ['Japaridze Group'],
    });
    expect(subject).toMatchObject({
      kind: SubjectKind.PublicPerson,
      role: 'Director',
      companies: ['Japaridze Group'],
    });
    expect(typeof subject !== 'string' && subject.names.slice(0, 2)).toEqual([
      'Levan Japaridze',
      expect.any(String),
    ]);
  });

  it('researches a person on Misho’s list under the account’s name', () => {
    const listed = {
      account: { ...ACCOUNT, joined: false, employer: null, job: null, city: null },
      heads: [],
      companies: ['Sponsify'],
      listed: true,
    };
    expect(subjectFrom(PHONE, listed)).toMatchObject({
      kind: SubjectKind.Listed,
      companies: ['Sponsify'],
    });
  });

  it('refuses a member without a name', () => {
    expect(subjectFrom(PHONE, { ...NOTHING, account: { ...ACCOUNT, name: ' ' } })).toBe(
      SubjectRefusal.NoName,
    );
  });

  it('spells each name once, whatever the case', () => {
    expect(nameSpellings(['Nino Beridze', 'nino beridze', ''])).toHaveLength(2);
  });

  it('refuses a person who removed a researched fact, and asks for Netai use and the list', async () => {
    mockQuery.mockImplementation(async (sql: string) =>
      /removed_by_subject_at IS NOT NULL/u.test(sql) ? { rows: [{ n: 1 }] } : { rows: [ACCOUNT] },
    );
    await expect(researchSubject(PHONE)).resolves.toBe(SubjectRefusal.RemovedByPerson);
    const sqls = mockQuery.mock.calls.map((c) => String(c[0]));
    const accountSql = sqls.find((s) => s.includes('"User"')) ?? '';
    expect(accountSql).toContain(`u.status = 'ACTIVE'`);
    expect(accountSql).toContain('FROM search_activity');
    const listCall = mockQuery.mock.calls.find((c) => String(c[0]).includes('research_load = ANY'));
    expect(listCall?.[1]).toEqual([PHONE, [...APPROVED_LISTS]]);
    expect(mockQuery.mock.calls.every((c) => typeof c[2] === 'number')).toBe(true);
  });
});
