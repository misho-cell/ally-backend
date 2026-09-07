import {
  employerNamedIn,
  employersInPastRoles,
  endedBeforeNow,
  sameEmployer,
  sortRolesByTense,
} from '../roleDating';

const NOW = new Date('2026-09-07T00:00:00Z');

describe('has the period closed', () => {
  it('a range ending before this year has', () => {
    expect(endedBeforeNow('COO @ De.Fi (2020–2024)', NOW)).toBe(true);
    expect(endedBeforeNow('Head of X, Y (2019 - 2021)', NOW)).toBe(true);
    expect(endedBeforeNow('CEO @ Z, 2015 to 2018', NOW)).toBe(true);
  });

  it('a range that reaches this year or is open has not', () => {
    expect(endedBeforeNow('CEO @ FU Capital (2024–2026)', NOW)).toBe(false);
    expect(endedBeforeNow('Co-Founder & CEO @ KLIPY (2022–present)', NOW)).toBe(false);
    expect(endedBeforeNow('Advisor @ Q (2023–now)', NOW)).toBe(false);
  });

  it('a lone bracketed year before this one has — „Mentor, Techstars (2023)" is over', () => {
    expect(endedBeforeNow('Mentor, Techstars (2023)', NOW)).toBe(true);
    expect(endedBeforeNow('Mentor, Techstars (2026)', NOW)).toBe(false);
  });

  it('an undated value is presumed current — the employer check is the second line', () => {
    expect(endedBeforeNow('Partner, Audit Quality, Nexia TA', NOW)).toBe(false);
  });
});

describe('which employer a role names', () => {
  it('reads the „@" form up to the location or the dates', () => {
    expect(employerNamedIn('Co-Founder & CEO @ KLIPY, San Francisco Bay Area (2022–present)')).toBe(
      'KLIPY',
    );
    expect(employerNamedIn('Partner, Audit Quality @ NEXIA TA Georgia (2019–2024)')).toBe(
      'NEXIA TA Georgia',
    );
  });

  it('reads the comma form as the last segment', () => {
    expect(employerNamedIn('Partner, Audit Quality, Nexia TA')).toBe('Nexia TA');
    expect(employerNamedIn('Head of Product Delivery / COO, De.Fi')).toBe('De.Fi');
    expect(employerNamedIn('Mentor, Techstars (2023)')).toBe('Techstars');
  });

  it('names nothing for a bare title', () => {
    expect(employerNamedIn('Founder')).toBeNull();
  });

  it('splits the semicolon-joined past roles of the July files', () => {
    expect(
      employersInPastRoles([
        'CEO @ FU Capital (2024–2026); COO & Head of Product @ De.Fi (2020–2024); COO @ TBC Leasing (2017–2019)',
      ]),
    ).toEqual(['FU Capital', 'De.Fi', 'TBC Leasing']);
  });
});

describe('the same company under two spellings', () => {
  it('matches when the shorter name sits inside the longer', () => {
    expect(sameEmployer('Nexia TA', 'NEXIA TA Georgia')).toBe(true);
    expect(sameEmployer('De.Fi', 'de.fi')).toBe(true);
  });

  it('does not match different companies, or names with no real token', () => {
    expect(sameEmployer('TBC Leasing', 'TBC Bank')).toBe(false);
    expect(sameEmployer('AI', 'AI')).toBe(false);
  });
});

describe('sorting a file’s roles by tense', () => {
  it('demotes by ended range and by a past role at the same employer, and keeps the rest', () => {
    const verdict = sortRolesByTense(
      [
        'Partner, Audit Quality, Nexia TA',
        'CTO @ Gone Ltd (2019–2022)',
        'Co-Founder @ NewCo (2025–present)',
      ],
      ['Partner @ NEXIA TA Georgia (2019–2024)'],
      NOW,
    );

    expect(verdict.current).toEqual(['Co-Founder @ NewCo (2025–present)']);
    expect(verdict.demoted).toEqual([
      { value: 'Partner, Audit Quality, Nexia TA', reason: 'past_role_at_same_employer' },
      { value: 'CTO @ Gone Ltd (2019–2022)', reason: 'ended_range' },
    ]);
  });
});
