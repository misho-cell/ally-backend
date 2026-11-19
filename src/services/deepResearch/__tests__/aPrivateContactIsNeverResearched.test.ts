const mockQuery = jest.fn();
jest.mock('../../../db/postgres/client', () => ({
  __esModule: true,
  query: (...a: unknown[]) => mockQuery(...a),
}));

import { SubjectKind } from '../deepResearch.types';
import { SubjectRefusal, nameSpellings, researchSubject, subjectFrom } from '../researchSubject';

const PHONE = '+995599000001';
const MEMBER = { name: 'Nino Beridze', job: 'Head of Sales', employer: 'Colibri', city: 'Tbilisi' };
const HEAD = { name_ka: 'ლევან ჯაფარიძე', name_latin: 'Levan Japaridze', role: 'Director' };

beforeEach(() => mockQuery.mockReset());

/** Misho, 19 Nov: members and public office-holders only — never a private contact. */
describe('a private contact is never researched', () => {
  it('refuses a number that is neither a member nor a public head', () => {
    expect(subjectFrom(PHONE, null, [], ['Colibri'])).toBe(SubjectRefusal.PrivateContact);
  });

  it('researches a member on their own profile, in both alphabets', () => {
    const subject = subjectFrom(PHONE, MEMBER, [], ['Colibri', 'Lomidze & Co']);
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
    const subject = subjectFrom(PHONE, null, [HEAD], ['Japaridze Group']);
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

  it('refuses a member without a name', () => {
    expect(subjectFrom(PHONE, { ...MEMBER, name: ' ' }, [], [])).toBe(SubjectRefusal.NoName);
  });

  it('spells each name once, whatever the case', () => {
    expect(nameSpellings(['Nino Beridze', 'nino beridze', ''])).toHaveLength(2);
  });

  it('refuses a person who removed a researched fact, and reads only a live account', async () => {
    mockQuery.mockImplementation(async (sql: string) =>
      /removed_by_subject_at IS NOT NULL/u.test(sql) ? { rows: [{ n: 1 }] } : { rows: [MEMBER] },
    );
    await expect(researchSubject(PHONE)).resolves.toBe(SubjectRefusal.RemovedByPerson);
    const memberSql = mockQuery.mock.calls
      .map((c) => String(c[0]))
      .find((s) => s.includes('"User"'));
    expect(memberSql).toContain(`u.status = 'ACTIVE'`);
    expect(memberSql).toContain('"deletedAt" IS NULL');
    expect(mockQuery.mock.calls.every((c) => typeof c[2] === 'number')).toBe(true);
  });
});
