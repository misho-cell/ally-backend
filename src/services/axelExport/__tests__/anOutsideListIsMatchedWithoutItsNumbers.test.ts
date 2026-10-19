process.env.MCP_REF_SECRET = 'test-export-secret';
jest.mock('../../../db/postgres/client', () => ({ __esModule: true, query: jest.fn() }));
jest.mock('../axelExport.service', () => ({ __esModule: true, readInputs: jest.fn() }));
jest.mock('../axelData', () => ({
  __esModule: true,
  readAccountsByDigits: jest.fn(),
  readPhonebooks: jest.fn(),
  readTiers: jest.fn(),
}));

import { query } from '../../../db/postgres/client';
import { readInputs } from '../axelExport.service';
import { readAccountsByDigits, readPhonebooks, readTiers } from '../axelData';
import { exportPhoneHash } from '../exportHash';
import { keyedRoster, MemberInputs } from '../memberFiles';
import { matchOutsideNumbers } from '../outsideNumbers';

const mockQuery = query as jest.MockedFunction<typeof query>;

const SAVED = '995500000101';
const UNKNOWN = '995500000102';
const ROSTER = [
  { user_id: 11, name: 'a', phone: '+995500000011', on_netai: true, group: 'Axel' },
  { user_id: 12, name: 'b', phone: '+995500000012', on_netai: true, group: 'Axel' },
];

function members(): MemberInputs {
  return {
    roster: ROSTER,
    accounts: new Map(),
    activity: new Map(),
    phonebooks: [
      {
        owner_id: 11,
        contact_digits: SAVED,
        label: 'ანა კავთარაძე CELA',
        saved_at: null,
        source: null,
      },
      { owner_id: 12, contact_digits: SAVED, label: 'Ana K', saved_at: null, source: null },
    ],
    tags: [],
    scores: [],
    tiers: [{ owner_id: 12, contact_digits: SAVED, value: 'green' }],
    legacy: [],
    statedClose: [],
    digitsWithFacts: new Set(),
    accountsByDigits: new Map(),
  } as unknown as MemberInputs;
}

beforeEach(() => {
  jest.clearAllMocks();
  (readInputs as jest.Mock).mockResolvedValue(members());
  (readAccountsByDigits as jest.Mock).mockResolvedValue(
    new Map([[SAVED, { user_id: 701, netai_user: true }]]),
  );
  (readPhonebooks as jest.Mock).mockResolvedValue([
    { owner_id: 501, contact_digits: SAVED, label: 'ანა CELA', saved_at: null, source: null },
  ]);
  (readTiers as jest.Mock).mockResolvedValue([
    { owner_id: 501, contact_digits: SAVED, value: 'blue' },
  ]);
  mockQuery.mockImplementation(((sql: string) =>
    Promise.resolve({
      rows: String(sql).includes('"UserAlias"')
        ? [{ digits: SAVED, owners: 3 }]
        : [{ digits: SAVED, accounts: 1 }],
    })) as never);
});

/** The CELA list (Tornike, 19 Oct): matched as the Axel export reads the base. */
describe('the CELA numbers, matched without their numbers', () => {
  it('gives a saved number its hash, account, holders, members, labels, Tornike’s side and warmth', async () => {
    const keys = new Map(keyedRoster(ROSTER).map(({ key, m }) => [m.user_id, key]));
    const [row] = await matchOutsideNumbers([{ ref: 'CELA-004', phone: `+${SAVED}` }]);
    expect(row).toEqual({
      our_row_id: 'CELA-004',
      contact_hash: exportPhoneHash(SAVED),
      account_state: 'netai_user',
      user_id: 701,
      saved_by_count: 3,
      saved_by_axel_members: `${keys.get(11)};${keys.get(12)}`,
      labels: 'ანა კავთარაძე CELA | Ana K',
      tornike_label: 'ანა CELA',
      tornike_tier: 'blue',
      warm_members: String(keys.get(12)),
      note: '',
    });
  });

  it('answers a number nobody holds with its hash and nothing else', async () => {
    const [row] = await matchOutsideNumbers([{ ref: 'CELA-221', phone: UNKNOWN }]);
    expect(row).toMatchObject({
      contact_hash: exportPhoneHash(UNKNOWN),
      account_state: 'none',
      user_id: '',
      saved_by_count: 0,
      saved_by_axel_members: '',
      tornike_label: '',
    });
  });

  it('never carries a number in what it answers', async () => {
    const rows = await matchOutsideNumbers([
      { ref: 'CELA-004', phone: SAVED },
      { ref: 'CELA-221', phone: UNKNOWN },
    ]);
    const text = JSON.stringify(rows);
    expect(text).not.toContain(SAVED);
    expect(text).not.toContain(UNKNOWN);
  });
});
