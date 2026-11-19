jest.mock('../../../db/postgres/client', () => ({ __esModule: true, query: jest.fn() }));

import { ProviderName, SamePerson, SubjectKind } from '../deepResearch.types';
import {
  pagesToRead,
  findSearches,
  newOrganisations,
  widenSearches,
  SearchEngine,
} from '../researchQueries';
import { findingsFrom, linkedinProfile, nameOnly, readerInput } from '../researchReader';

const SUBJECT = {
  phone: '+995599000001',
  kind: SubjectKind.Member,
  names: ['Nino Beridze', 'ნინო ბერიძე'],
  companies: ['Colibri'],
  role: 'Head of Sales',
  city: '',
};
const PAGES = [
  {
    url: 'https://colibri.ge/team',
    title: 'Team',
    text: 'Nino Beridze, Head of Sales',
    provider: ProviderName.Exa,
  },
  {
    url: 'https://other.com/nino',
    title: 'Nino Beridze, dentist',
    text: 'Berlin',
    provider: ProviderName.Exa,
  },
  {
    url: 'https://www.linkedin.com/in/nino-beridze-1?trk=x',
    title: 'Nino',
    text: '',
    provider: ProviderName.Exa,
  },
];

/** Misho, 19 Nov: every fact with its page; a namesake is not the person. */
describe('a research fact names its own page', () => {
  it('keeps a fact only from a page that is this person, confirmed only when stated there', () => {
    const findings = findingsFrom(
      {
        pages: [
          { page: 1, same_person: 'yes' },
          { page: 2, same_person: 'no' },
          { page: 3, same_person: 'unsure' },
          { page: 9, same_person: 'yes' },
        ],
        facts: [
          { key: 'employer', value: 'Colibri', page: 1, certainty: 'stated' },
          { key: 'expertise', value: 'B2B sales', page: 1, certainty: 'inferred' },
          { key: 'occupation', value: 'Dentist', page: 2, certainty: 'stated' },
          { key: 'family', value: 'married', page: 1, certainty: 'stated' },
          {
            key: 'linkedin',
            value: 'https://www.linkedin.com/in/nino-beridze-1?trk=x',
            page: 3,
            certainty: 'stated',
          },
          { key: 'website', value: 'not a link', page: 1, certainty: 'stated' },
          { key: 'education', value: 'TSU', page: 7, certainty: 'stated' },
        ],
      },
      PAGES,
      SUBJECT,
    );
    const profile = {
      key: 'linkedin',
      value: 'https://www.linkedin.com/in/nino-beridze-1',
      source_url: PAGES[2].url,
      status: 'possible',
    };
    expect(findings.verdicts).toHaveLength(3);
    expect(findings.facts).toEqual([
      profile,
      { key: 'employer', value: 'Colibri', source_url: PAGES[0].url, status: 'confirmed' },
      { key: 'expertise', value: 'B2B sales', source_url: PAGES[0].url, status: 'possible' },
      {
        key: 'linkedin',
        value: 'https://www.linkedin.com/in/nino-beridze-1',
        source_url: PAGES[2].url,
        status: 'possible',
      },
    ]);
  });

  it('reads nothing from an answer without the tool call', () => {
    expect(findingsFrom(null, PAGES, SUBJECT)).toEqual({ verdicts: [], facts: [] });
  });

  it('is never sure of a page when the base knows the person by name alone (the 19 Nov namesake)', () => {
    const nameOnlySubject = { ...SUBJECT, companies: [], role: '' };
    const findings = findingsFrom(
      {
        pages: [
          { page: 1, same_person: 'yes' },
          { page: 3, same_person: 'yes' },
        ],
        facts: [{ key: 'employer', value: 'Colibri', page: 1, certainty: 'stated' }],
      },
      PAGES,
      nameOnlySubject,
    );
    expect(findings.verdicts.map((v) => v.samePerson)).toEqual([
      SamePerson.Unsure,
      SamePerson.Unsure,
    ]);
    expect(findings.facts.every((f) => f.status === 'possible')).toBe(true);
    expect(nameOnly(SUBJECT)).toBe(false);
  });

  it('takes a profile page as the person’s own only when its address carries their name', () => {
    const colleague = {
      url: 'https://www.linkedin.com/in/levan-japaridze-77',
      title: 'Levan Japaridze',
      text: 'Worked with Nino Beridze at Colibri',
      provider: ProviderName.Exa,
    };
    const findings = findingsFrom(
      {
        pages: [
          { page: 1, same_person: 'yes' },
          { page: 2, same_person: 'yes' },
        ],
        facts: [],
      },
      [colleague, { ...PAGES[2], url: 'https://www.linkedin.com/in/nino-beridze-1' }],
      SUBJECT,
    );
    expect(findings.facts).toEqual([
      {
        key: 'linkedin',
        value: 'https://www.linkedin.com/in/nino-beridze-1',
        source_url: 'https://www.linkedin.com/in/nino-beridze-1',
        status: 'confirmed',
      },
    ]);
  });

  it('writes one profile in one form, whatever the address it was found under', () => {
    expect(linkedinProfile('https://ge.linkedin.com/in/Nino-Beridze-1/?trk=x')).toBe(
      'https://www.linkedin.com/in/nino-beridze-1',
    );
    expect(linkedinProfile('https://www.linkedin.com/posts/nino_x')).toBe('');
    expect(linkedinProfile('https://linkedin.com/in/%E0%A4bad')).toBe(
      'https://www.linkedin.com/in/%e0%a4bad',
    );
  });

  it('gives the model the person and numbered pages', () => {
    const input = readerInput(SUBJECT, PAGES.slice(0, 1));
    expect(input).toContain('Name: Nino Beridze / ნინო ბერიძე');
    expect(input).toContain('[1] https://colibri.ge/team');
  });

  it('finds through the people index, the open web in both spellings, and Linkup', () => {
    expect(findSearches(SUBJECT).map((s) => s.engine)).toEqual([
      SearchEngine.ExaPeople,
      SearchEngine.ExaWeb,
      SearchEngine.LinkupStandard,
      SearchEngine.ExaWeb,
    ]);
  });

  it('widens with the organisations found, then one deep search', () => {
    const facts = [
      {
        key: 'past_roles',
        value: 'Lomidze & Co',
        source_url: 'https://a.ge',
        status: 'confirmed' as const,
      },
      {
        key: 'employer',
        value: 'colibri',
        source_url: 'https://a.ge',
        status: 'confirmed' as const,
      },
      {
        key: 'employer',
        value: 'Maybe Ltd',
        source_url: 'https://a.ge',
        status: 'possible' as const,
      },
    ];
    expect(newOrganisations(SUBJECT, facts)).toEqual(['Lomidze & Co']);
    const widen = widenSearches(SUBJECT, facts);
    expect(widen.map((s) => s.engine)).toEqual([SearchEngine.ExaWeb, SearchEngine.LinkupDeep]);
    expect(widen[1].query).toContain('Lomidze & Co');
  });

  it('reads the person’s own pages first, never a login-walled one or one read before', () => {
    const urls = pagesToRead(
      [
        { url: 'https://b.ge', samePerson: SamePerson.Unsure },
        { url: 'https://a.ge', samePerson: SamePerson.Yes },
        { url: 'https://www.linkedin.com/in/x', samePerson: SamePerson.Yes },
        { url: 'https://c.ge', samePerson: SamePerson.No },
        { url: 'https://d.ge', samePerson: SamePerson.Yes },
      ],
      new Set(['https://d.ge']),
    );
    expect(urls).toEqual(['https://a.ge', 'https://b.ge']);
  });
});
