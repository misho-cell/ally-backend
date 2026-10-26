const mockQuery = jest.fn();
const mockClientQuery = jest.fn();
jest.mock('../../db/postgres/client', () => ({
  __esModule: true,
  query: (...a: unknown[]) => mockQuery(...a),
  withTransaction: (callback: (client: unknown) => Promise<unknown>) =>
    callback({ query: (...a: unknown[]) => mockClientQuery(...a) }),
}));
const mockNumbers = jest.fn();
jest.mock('../axelLoad/axelBaseLoad.service', () => ({
  numbersByHash: (...a: unknown[]) => mockNumbers(...a),
}));
const mockExclusions = jest.fn();
jest.mock('../tools/contactExclusions', () => ({
  fetchExclusionsForPhones: (...a: unknown[]) => mockExclusions(...a),
}));

import { readFileSync } from 'fs';
import { join } from 'path';
import { BasePeoplePart, loadBasePeoplePart } from '../basePeople/basePeopleLoad.service';
import {
  factRows,
  memberIdOfKey,
  nameOfKey,
  numberLeads,
  personRows,
  tieRows,
  tokenOfKey,
} from '../basePeople/basePeoplePlan';
import { bridgesFor, findPeopleInBase, placeAndTrade } from '../tools/findPeopleInBase';

const GEORGE_TOKEN = 'b'.repeat(24);
const RUSTAM = 'name:Rustam Akhmetov';
const NUMBERS = `person_key,number_hash,tie\nAX-028,${GEORGE_TOKEN},strong\nP-9,${'c'.repeat(24)},weak\n`;
const TIES =
  'from_key,from_name,to_key,to_name,tie,basis,source,status,date,person_key\n' +
  `AX-028,George Simongulashvili,${RUSTAM},Rustam Akhmetov,CELA cohort 13 classmates,same cohort,CELA,confirmed,2026-10-19,\n` +
  `U-41,Nino,${RUSTAM},Rustam Akhmetov,saved in phonebook,saved,list,confirmed,2026-10-20,\n` +
  `AX-028,George Simongulashvili,AX-028,George Simongulashvili,self,x,x,confirmed,,\n` +
  `P-1,A,P-2,B,classmates,x,x,maybe,,\n`;
const FACTS =
  'person_key,key,value,status,confidence,source,date\n' +
  `${RUSTAM},occupation,"Executive Director, TransCaspian Cargo",confirmed,web,https://celanetwork.org,2026-10-19\n` +
  `${RUSTAM},country,Kazakhstan,confirmed,web,https://celanetwork.org,2026-10-19\n` +
  `${RUSTAM},saved_in_phonebooks_as,Rusik,confirmed,label,x,2026-10-19\n` +
  `P-5,occupation,CFO,possible,web,x,2026-10-19\n`;

beforeEach(() => {
  jest.resetAllMocks();
  mockExclusions.mockResolvedValue(new Map());
});

/** Board 6997: a person with no number is held, and found through who knows them. */
describe('the person store reads the package', () => {
  it('reads a key as a number token, a name or a member account', () => {
    expect(tokenOfKey(`hash:${'A'.repeat(24)}`)).toBe('a'.repeat(24));
    expect(tokenOfKey('P-3b40d151')).toBeNull();
    expect(nameOfKey(RUSTAM)).toBe('Rustam Akhmetov');
    expect(nameOfKey('AX-028')).toBeNull();
    expect(memberIdOfKey('U-41')).toBe(41);
    expect(memberIdOfKey('U-x')).toBeNull();
  });

  it('finds a number lead only through a loadable token or a member account', () => {
    const leads = numberLeads(['AX-028', 'P-9', 'U-41', RUSTAM], NUMBERS);
    expect(leads.get('AX-028')).toEqual({ token: GEORGE_TOKEN, memberId: null });
    expect(leads.get('U-41')).toEqual({ token: null, memberId: 41 });
    expect(leads.has('P-9')).toBe(false);
    expect(leads.has(RUSTAM)).toBe(false);
  });

  it('keeps confirmed ties between two people, and both ends as people', () => {
    const { ties, people } = tieRows(TIES);
    expect(ties.map((t) => t.tie)).toEqual(['CELA cohort 13 classmates', 'saved in phonebook']);
    expect(people.map((p) => p.personKey).sort()).toEqual(['AX-028', 'U-41', RUSTAM].sort());
  });

  it('keeps only confirmed facts that may be said, and a name key brings its person', () => {
    const { facts, people } = factRows(FACTS);
    expect(facts.map((f) => f.key)).toEqual(['occupation', 'country']);
    expect(people).toEqual([{ personKey: RUSTAM, name: 'Rustam Akhmetov' }]);
  });

  it('reads people.csv and cela_people.csv names, one row per key', () => {
    const csv = 'person_key,name_latin\nAX-028,George Simongulashvili\nAX-028,Other\n,Nobody\n';
    expect(personRows(csv)).toEqual([{ personKey: 'AX-028', name: 'George Simongulashvili' }]);
    expect(personRows('person_key,list_id,name\nCL-1,CL-1,Akaki\n')[0].name).toBe('Akaki');
  });
});

describe('the person store loads', () => {
  it('finds the numbers the server holds and writes nothing on a dry run', async () => {
    mockNumbers.mockResolvedValue(new Map([[GEORGE_TOKEN, '+995555000028']]));
    mockQuery.mockResolvedValue({ rows: [{ user_id: 41, phone: '+995555000041' }] });
    const report = await loadBasePeoplePart(BasePeoplePart.Ties, TIES, true, NUMBERS);
    expect(report).toMatchObject({ rows_in_file: 2, people_written: 3, people_with_number: 2 });
    expect(mockClientQuery).not.toHaveBeenCalled();
  });

  it('upserts in one transaction and counts the rows whose person is not loaded', async () => {
    mockNumbers.mockResolvedValue(new Map());
    mockQuery.mockResolvedValue({ rows: [] });
    mockClientQuery.mockImplementation((sql: string) =>
      Promise.resolve({ rowCount: sql.includes('INSERT INTO base_person_facts') ? 1 : 0 }),
    );
    const report = await loadBasePeoplePart(BasePeoplePart.Facts, FACTS, false);
    expect(report.rows_written).toBe(1);
    expect(report.skipped).toEqual({ end_or_person_not_loaded: 1 });
    const sqls = mockClientQuery.mock.calls.map(([sql]) => String(sql));
    expect(sqls.some((s) => s.includes('ON CONFLICT (person_key) DO UPDATE'))).toBe(true);
    expect(sqls.some((s) => s.includes('ON CONFLICT (person_key, key, value) DO UPDATE'))).toBe(
      true,
    );
    expect(sqls.some((s) => s.includes('SET search_text'))).toBe(true);
  });
});

describe('a need finds a person with no number, with who can reach them', () => {
  it('reads a country in the need as the place, the rest as the trade', () => {
    expect(placeAndTrade(['cargo', 'kazakhstan'], ['kazakhstan', 'georgia'])).toEqual({
      place: 'kazakhstan',
      trade: ['cargo'],
    });
    expect(placeAndTrade(['kazakhstan'], ['kazakhstan']).trade).toEqual(['kazakhstan']);
    expect(placeAndTrade(['cargo'], ['georgia'])).toEqual({ place: '', trade: ['cargo'] });
  });

  it('puts the owner first, then his own contacts, one row per number', () => {
    const tie = (name: string, phone: string): Record<string, string> => ({
      person_key: RUSTAM,
      name,
      phone,
      tie: 'classmates',
    });
    const bridges = bridgesFor(
      [
        tie('Zura', '+995 555 000 099'),
        tie('George', '+995555000028'),
        tie('Me', '+995555000007'),
        tie('Zura again', '+995555000099'),
      ] as never,
      { own: new Set(['995555000007']), savedAs: new Map([['995555000028', 'Gio Simon']]) },
      new Map(),
    );
    expect(bridges.map((b) => b.name)).toEqual(['Me', 'George', 'Zura']);
    expect(bridges[0].is_you).toBe(true);
    expect(bridges[1].you_saved_as).toBe('Gio Simon');
  });

  it('finds Rustam in Kazakhstan through George, whom the owner has saved', async () => {
    mockQuery.mockImplementation((sql: string) => {
      if (sql.includes('AS place FROM base_person_facts'))
        return Promise.resolve({ rows: [{ place: 'kazakhstan' }] });
      if (sql.includes('FROM base_people p'))
        return Promise.resolve({
          rows: [{ person_key: RUSTAM, name: 'Rustam Akhmetov', phone: null, hits: 1 }],
        });
      if (sql.includes('FROM base_person_facts'))
        return Promise.resolve({
          rows: [{ person_key: RUSTAM, key: 'occupation', value: 'TransCaspian Cargo' }],
        });
      if (sql.includes('FROM base_person_ties'))
        return Promise.resolve({
          rows: [{ person_key: RUSTAM, name: 'George', phone: '+995555000028', tie: 'CELA 13' }],
        });
      return Promise.resolve({
        rows: [{ digits: '995555000028', label: 'Gio Simon', is_own: false }],
      });
    });
    const out = await findPeopleInBase('7', 'cargo freight Kazakhstan');
    expect(out.place).toBe('kazakhstan');
    expect(out.people).toEqual([
      {
        name: 'Rustam Akhmetov',
        has_number: false,
        facts: [{ key: 'occupation', value: 'TransCaspian Cargo' }],
        known_by: [
          { name: 'George', tie: 'CELA 13', phone: '+995555000028', you_saved_as: 'Gio Simon' },
        ],
      },
    ]);
    const hitCall = mockQuery.mock.calls.find(([sql]) =>
      String(sql).includes('FROM base_people p'),
    );
    expect(hitCall?.[1]).toEqual([['cargo', 'freight'], 'kazakhstan', expect.any(Number)]);
    expect(hitCall?.[2]).toBeGreaterThan(0);
  });

  it('reads nothing for a need with no usable word', async () => {
    const out = await findPeopleInBase('7', 'a b');
    expect(out.people).toEqual([]);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('is loaded by its own admin route and is ON since the live load (26 Oct)', () => {
    const routes = readFileSync(
      join(__dirname, '..', '..', 'api', 'routes', 'admin.routes.ts'),
      'utf8',
    );
    expect(routes).toContain("adminRouter.post('/base-people/load'");
    expect(routes).toContain('part (people | ties | facts), csv (text) and dry_run');
    const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
    expect(chat).toContain('export const BASE_PEOPLE_TOOL_ON = true;');
    expect(chat).toContain("case 'find_people_in_base':");
  });
});
