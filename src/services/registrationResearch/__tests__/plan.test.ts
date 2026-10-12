import {
  confidenceOf,
  FactConfidence,
  factsToStore,
  firstQueries,
  MAX_PAGES_PER_PERSON,
  MAX_SEARCHES_PER_PERSON,
  pagesLeft,
  searchesLeft,
  sourceHost,
  usableFact,
} from '../plan';

const SITE_A = 'https://www.example-a.ge/team';
const SITE_B = 'https://news.example-b.com/item';
const OFFICIAL = 'https://www.parliament.ge/members/1';

/** 4126 item 1: the searches, the stop and how sure each fact is (D757 §3). */
describe('registration research plan', () => {
  it('searches the name alone first, then with the city given', () => {
    expect(firstQueries('ნინო საცდელი', 'თბილისი')).toEqual([
      '"ნინო საცდელი"',
      '"ნინო საცდელი" თბილისი',
      '"ნინო საცდელი" LinkedIn',
      '"ნინო საცდელი" company',
      '"ნინო საცდელი" სამსახური',
    ]);
    expect(firstQueries('  ', null)).toEqual([]);
  });

  it('keeps Misho’s stop: 60 searches and 30 pages per person', () => {
    expect(MAX_SEARCHES_PER_PERSON).toBe(60);
    expect(MAX_PAGES_PER_PERSON).toBe(30);
    expect(searchesLeft(59)).toBe(1);
    expect(searchesLeft(70)).toBe(0);
    expect(pagesLeft(30)).toBe(0);
  });

  it('calls one ordinary source possible, two sites or one official source confirmed', () => {
    expect(confidenceOf([SITE_A])).toBe(FactConfidence.Possible);
    expect(confidenceOf([SITE_A, `${SITE_A}/again`])).toBe(FactConfidence.Possible);
    expect(confidenceOf([SITE_A, SITE_B])).toBe(FactConfidence.Confirmed);
    expect(confidenceOf([OFFICIAL])).toBe(FactConfidence.Confirmed);
  });

  it('reads the site without www, and nothing from a non-URL', () => {
    expect(sourceHost(SITE_A)).toBe('example-a.ge');
    expect(sourceHost('not a url')).toBeNull();
  });

  it('drops a fact with an unknown key, no value or no real source', () => {
    expect(usableFact({ key: 'religion', value: 'x', sources: [SITE_A], date: null })).toBeNull();
    expect(usableFact({ key: 'employer', value: ' ', sources: [SITE_A], date: null })).toBeNull();
    expect(usableFact({ key: 'employer', value: 'TBC', sources: ['nope'], date: null })).toBeNull();
    expect(usableFact({ key: 'Employer', value: 'TBC', sources: [SITE_A], date: '2025' })).toEqual({
      key: 'employer',
      value: 'TBC',
      sources: [SITE_A],
      date: null,
    });
  });

  it('keeps the strongest of two employers and says what else was found', () => {
    const stored = factsToStore([
      { key: 'employer', value: 'Bank A', sources: [SITE_A], date: null },
      { key: 'employer', value: 'Bank B', sources: [SITE_A, SITE_B], date: '2025-03-01' },
      { key: 'expertise', value: 'audit', sources: [SITE_B], date: null },
    ]);
    const employer = stored.find((f) => f.key === 'employer');
    expect(employer).toEqual({
      key: 'employer',
      value: 'Bank B',
      sourceUrl: SITE_A,
      date: '2025-03-01',
      confidence: FactConfidence.Confirmed,
      conflictNote: `also found: „Bank A" (${SITE_A})`,
    });
    expect(stored.find((f) => f.key === 'expertise')?.confidence).toBe(FactConfidence.Possible);
  });

  it('notes no conflict when the same value comes twice', () => {
    const stored = factsToStore([
      { key: 'city', value: 'Tbilisi', sources: [SITE_A], date: null },
      { key: 'city', value: 'tbilisi', sources: [SITE_B], date: null },
    ]);
    expect(stored).toHaveLength(1);
    expect(stored[0].conflictNote).toBeNull();
  });
});
