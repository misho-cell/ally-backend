jest.mock('../../db/postgres/client', () => ({ query: jest.fn(), __esModule: true }));
jest.mock('../contactFacts.service', () => ({
  __esModule: true,
  submitContactFact: jest.fn().mockResolvedValue({ is_public: true, canonical_value: null }),
}));

import { query } from '../../db/postgres/client';
import { submitContactFact } from '../contactFacts.service';
import { importProfiles, parseProfile, resolveProfilePhone } from '../profileImport.service';

const mockQuery = query as jest.MockedFunction<typeof query>;
const mockSubmit = submitContactFact as jest.MockedFunction<typeof submitContactFact>;

function rows(data: unknown[]): { rows: unknown[]; rowCount: number } {
  return { rows: data, rowCount: data.length };
}

// A real file from batch 3, shortened but structurally identical.
const FILE = `# --- PUBLIC ---
name: Givi Beridze
headline: Co-Founder, CEO @ KLIPY
country: United States
seniority: 9+ yrs; founder / C-level

role: Co-Founder & CEO @ KLIPY, San Francisco Bay Area (2022–present)

past_role: Mentor, Techstars (2023)
role_type: founder

skill: Venture Capital
expertise_topic: content api products
industry: developer tools
education: Bachelor's Degree, Free University of Tbilisi (2014–2018)
language: Georgian (native or bilingual)
link: linkedin.com/in/giviberidze

# --- PRIVATE (owner-only, never shared) ---
note: self-description: "2x founder, Forbes 30u30"
note: based San Francisco while prior board footprint is Georgian
`;

beforeEach(() => {
  jest.clearAllMocks();
});

describe('parseProfile', () => {
  it('reads the public fields and maps expertise_topic to the key the product uses', () => {
    const parsed = parseProfile(FILE);

    expect(parsed?.name).toBe('Givi Beridze');
    expect(parsed?.facts['expertise']).toEqual(['content api products']);
    expect(parsed?.facts['role']).toEqual([
      'Co-Founder & CEO @ KLIPY, San Francisco Bay Area (2022–present)',
    ]);
    expect(parsed?.facts['past_role']).toEqual(['Mentor, Techstars (2023)']);
    expect(parsed?.facts['link']).toEqual(['linkedin.com/in/giviberidze']);
  });

  it('never imports the PRIVATE section — the file says owner-only, never shared', () => {
    const parsed = parseProfile(FILE);

    expect(parsed?.facts['note']).toBeUndefined();
    expect(JSON.stringify(parsed)).not.toContain('Forbes');
  });

  it('lifts the employer out of the CURRENT role, because fit reads employer', () => {
    const parsed = parseProfile(FILE);

    expect(parsed?.facts['employer']).toEqual(['KLIPY']);
  });

  it('takes no employer from a past role — a former one would read as current', () => {
    const parsed = parseProfile(`name: X Y\npast_role: CEO @ OldCo (2019)\n`);

    expect(parsed?.facts['employer']).toBeUndefined();
  });

  it('returns null for a file with no name rather than importing an anonymous profile', () => {
    expect(parseProfile('headline: someone\n')).toBeNull();
  });
});

describe('resolveProfilePhone — key on phone identity, not on name', () => {
  it('resolves when exactly one phone carries BOTH name tokens', async () => {
    mockQuery.mockResolvedValue(rows([{ phone: '+995599111111', contributors: '9' }]) as never);

    const out = await resolveProfilePhone('Givi Beridze');

    expect(out.reason).toBe('resolved');
    expect(out.phone).toBe('+995599111111');
  });

  it('breaks a tie by the crowd: the number most people saved under that name wins', async () => {
    mockQuery.mockResolvedValue(
      rows([
        { phone: '+995599111111', contributors: '17' },
        { phone: '+995599222222', contributors: '1' },
      ]) as never,
    );

    const out = await resolveProfilePhone('Givi Beridze');

    expect(out.reason).toBe('resolved');
    expect(out.phone).toBe('+995599111111');
  });

  it('an actual tie is not an answer — nobody is picked', async () => {
    mockQuery.mockResolvedValue(
      rows([
        { phone: '+995599111111', contributors: '4' },
        { phone: '+995599222222', contributors: '4' },
      ]) as never,
    );

    const out = await resolveProfilePhone('Nino Niauri');

    expect(out.reason).toBe('ambiguous');
    expect(out.phone).toBeNull();
  });

  it('one lone contributor is not a crowd — a single-saver match stays unresolved', async () => {
    mockQuery.mockResolvedValue(rows([{ phone: '+995599111111', contributors: '1' }]) as never);

    const out = await resolveProfilePhone('Nino Niauri');

    expect(out.reason).toBe('ambiguous');
    expect(out.candidates).toEqual([{ phone: '+995599111111', contributors: 1 }]);
  });

  it('requires BOTH tokens in the same alias — the Nino Niauri / Kaxa Niauri case', async () => {
    mockQuery.mockResolvedValue(rows([]) as never);

    await resolveProfilePhone('Nino Niauri');

    const [sql, params] = mockQuery.mock.calls[0] as [string, unknown[]];
    // Two separate whole-token conditions, ANDed — a shared surname alone
    // matched the wrong person last time.
    expect(sql.match(/normalize_search_token\(\$[12]\) = ANY/g)).toHaveLength(2);
    expect(params[0]).toBe('Nino');
    expect(params[1]).toBe('Niauri');
  });

  it('a single-word name resolves to nothing rather than to whoever shares it', async () => {
    const out = await resolveProfilePhone('Nino');

    expect(out.reason).toBe('no_match');
    expect(mockQuery).not.toHaveBeenCalled();
  });
});

describe('importProfiles', () => {
  it('writes nothing on a dry run, but still reports what it would do', async () => {
    mockQuery.mockResolvedValue(rows([{ phone: '+995599111111', contributors: '9' }]) as never);
    const parsed = parseProfile(FILE);

    const out = await importProfiles([parsed!], '501', true);

    expect(out.dry_run).toBe(true);
    expect(out.resolved).toBe(1);
    expect(out.facts_written).toBe(0);
    expect(out.rows[0]?.available).toBeGreaterThan(0);
    expect(mockSubmit).not.toHaveBeenCalled();
  });

  it('writes every fact against the resolved phone, as the curator', async () => {
    mockQuery.mockResolvedValue(rows([{ phone: '+995599111111', contributors: '9' }]) as never);
    const parsed = parseProfile(FILE);

    const out = await importProfiles([parsed!], '501', false);

    expect(out.facts_written).toBe(out.rows[0]?.available);
    expect(mockSubmit).toHaveBeenCalledWith(
      '501',
      '+995599111111',
      'role',
      'Co-Founder & CEO @ KLIPY, San Francisco Bay Area (2022–present)',
      'sweep',
      'stated',
    );
  });

  it('writes NOTHING for an ambiguous name, even on a real run', async () => {
    mockQuery.mockResolvedValue(
      rows([
        { phone: '+995599111111', contributors: '4' },
        { phone: '+995599222222', contributors: '4' },
      ]) as never,
    );
    const parsed = parseProfile(FILE);

    const out = await importProfiles([parsed!], '501', false);

    expect(out.ambiguous).toBe(1);
    expect(out.facts_written).toBe(0);
    expect(mockSubmit).not.toHaveBeenCalled();
  });
});
