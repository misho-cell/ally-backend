import { readFileSync } from 'fs';
import { join } from 'path';
import { basePlan, csvRecords, ResearchStatus } from '../axelBasePlan';
import { loadAxelBase, PUBLIC_RESEARCH, SYSTEM_SAVER_ID } from '../axelBaseLoad.service';
import { readPhonebooks, readRoster } from '../../axelExport/axelData';
import { withTransaction } from '../../../db/postgres/client';

jest.mock('../../../db/postgres/client', () => ({
  __esModule: true,
  query: jest.fn(),
  withTransaction: jest.fn(),
}));
jest.mock('../../axelExport/axelData', () => ({
  __esModule: true,
  readRoster: jest.fn(),
  readPhonebooks: jest.fn(),
}));
// The real hash needs the server secret; here a number's hash is its digits, padded.
jest.mock('../../axelExport/exportHash', () => ({
  __esModule: true,
  exportPhoneHash: (raw: string): string => raw.replace(/\D/gu, '').padStart(24, 'a'),
}));

const mockRoster = readRoster as jest.MockedFunction<typeof readRoster>;
const mockPhonebooks = readPhonebooks as jest.MockedFunction<typeof readPhonebooks>;
const mockTx = withTransaction as jest.MockedFunction<typeof withTransaction>;

const HASH_A = '995500000001'.padStart(24, 'a');
const HASH_B = '995500000002'.padStart(24, 'a');

const NUMBERS = [
  '﻿person_key,number_hash,hash_kind,tie,tie_basis,roster_key,saved_by_members,warm_to_members,account_state',
  `P-1,${HASH_A},member_hash,roster,own phonebook,1,3,2,netai_user`,
  `P-2,${HASH_B},contact_hash,weak,name only,,1,0,none`,
].join('\n');

const FACTS = [
  'person_key,key,value,status,confidence,source,date',
  'P-1,employer,"Acme, Tbilisi",confirmed,mentioned,https://a.example ; https://b.example,seen 2026-10-04',
  'P-1,expertise,Logistics,possible,mentioned,https://a.example,2026-10-05',
  'P-1,employer,Second Co,possible,mentioned,https://c.example,2026-10-05',
  'P-2,employer,Weak Co,possible,mentioned,https://d.example,2026-10-05',
  'P-1,bad key!,x,possible,mentioned,https://e.example,2026-10-05',
].join('\n');

/** 4225: the Axel package's loadable facts, onto the numbers they belong to. */
describe('the load plan', () => {
  it('reads a file with a byte-order mark and quoted commas', () => {
    const rows = csvRecords(FACTS);
    expect(rows[0].value).toBe('Acme, Tbilisi');
    expect(Object.keys(csvRecords(NUMBERS)[0])[0]).toBe('person_key');
  });

  it('takes roster and strong ties, never a weak one, and counts what it leaves out', () => {
    const plan = basePlan(NUMBERS, FACTS);
    expect([...plan.byHash.keys()]).toEqual([HASH_A]);
    const facts = plan.byHash.get(HASH_A) ?? [];
    expect(facts.map((f) => f.key)).toEqual(['employer', 'expertise', 'employer']);
    expect(facts[0]).toEqual({
      key: 'employer',
      value: 'Acme, Tbilisi',
      status: ResearchStatus.Confirmed,
      sourceUrl: 'https://a.example ; https://b.example',
      factDate: '2026-10-04',
    });
    expect(plan.skipped).toEqual({
      tie_not_loadable: 1,
      fact_without_loadable_number: 1,
      bad_fact_row: 1,
    });
  });
});

describe('the load', () => {
  const client = { query: jest.fn() };

  beforeEach(() => {
    jest.clearAllMocks();
    mockRoster.mockResolvedValue([{ user_id: 7, phone: '+995 500 000 001' }] as never);
    mockPhonebooks.mockResolvedValue([] as never);
    mockTx.mockImplementation(async (cb) => cb(client as never));
    client.query.mockResolvedValue({ rows: [] });
  });

  it('writes nothing on a dry run, and says what it would write', async () => {
    const report = await loadAxelBase(NUMBERS, FACTS, true);
    expect(mockTx).not.toHaveBeenCalled();
    expect(report).toMatchObject({
      dry_run: true,
      numbers_in_file: 1,
      numbers_found: 1,
      facts_written: 2,
    });
    expect(report.skipped.second_value_for_one_per_saver_key).toBe(1);
  });

  it('replaces the number’s research rows whole, as the system saver, private', async () => {
    const report = await loadAxelBase(NUMBERS, FACTS, false);
    expect(report.facts_written).toBe(2);
    const [del, ...inserts] = client.query.mock.calls;
    expect(String(del[0])).toContain('DELETE FROM contact_facts');
    expect(del[1]).toEqual(['+995500000001', SYSTEM_SAVER_ID, PUBLIC_RESEARCH]);
    expect(inserts).toHaveLength(2);
    expect(String(inserts[0][0])).toContain("false, $5, 'mentioned', false");
    expect(inserts[0][1]).toEqual([
      '+995500000001',
      SYSTEM_SAVER_ID,
      'employer',
      'Acme, Tbilisi',
      PUBLIC_RESEARCH,
      'https://a.example ; https://b.example',
      '2026-10-04',
      'confirmed',
    ]);
  });

  it('counts a number the server does not hold, and writes nothing for it', async () => {
    mockRoster.mockResolvedValue([] as never);
    const report = await loadAxelBase(NUMBERS, FACTS, false);
    expect(report).toMatchObject({ numbers_found: 0, numbers_not_found: 1, facts_written: 0 });
  });
});

describe('research is never the second saver', () => {
  const read = (file: string): string => readFileSync(join(__dirname, '..', '..', file), 'utf8');

  it('is left out of every crowd-promotion read', () => {
    const facts = read('contactFacts.service.ts');
    const others = facts.slice(facts.indexOf('async function getOtherFacts('));
    expect(others.slice(0, 600)).toContain("source IS DISTINCT FROM 'public_research'");
    const republish = read('factRepublish.service.ts');
    expect(republish.match(/source IS DISTINCT FROM 'public_research'/gu)).toHaveLength(3);
  });
});
