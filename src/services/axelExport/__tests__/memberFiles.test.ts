import { readFileSync } from 'fs';
import { join } from 'path';
import { buildMemberFiles, manifest, zipFiles } from '../axelExport.service';
import type { MemberInputs } from '../memberFiles';
import { exportPhoneHash } from '../exportHash';

/** The Axel export, parts A and D (Misho, 6 Oct). */
const saved = process.env.MCP_REF_SECRET;
beforeAll(() => {
  process.env.MCP_REF_SECRET = 'test-secret';
});
afterAll(() => {
  if (saved === undefined) delete process.env.MCP_REF_SECRET;
  else process.env.MCP_REF_SECRET = saved;
});

const member = (phone: string, userId: number | null) => ({
  user_id: userId,
  name: 'x',
  phone,
  on_netai: userId !== null,
  group: 'Axel',
  match_names: [],
});
const ov = (owner: number, digits: string, value: string) => ({
  owner_id: owner,
  contact_digits: digits,
  value,
});

const INPUTS: MemberInputs = {
  roster: [member('995599000001', 1), member('995599000002', null)],
  accounts: new Map([
    [
      1,
      {
        id: 1,
        created_at: new Date('2026-01-01T00:00:00Z'),
        deleted_at: null,
        subscription_status: 'active',
        job_position: null,
        employer: 'Acme',
        city: null,
        netai_user: true,
        last_active: null,
      },
    ],
  ]),
  activity: new Map(),
  phonebooks: [
    { owner_id: 1, contact_digits: '995599000002', label: 'B', saved_at: null, source: null },
    { owner_id: 1, contact_digits: '995599000003', label: 'C', saved_at: null, source: null },
  ],
  tags: [ov(1, '995599000003', 'dentist|USER_CREATED')],
  scores: [],
  tiers: [ov(1, '995599000002', 'green')],
  legacy: [ov(1, '995599000003', 'contacts')],
  statedClose: [],
  digitsWithFacts: new Set(['995599000003']),
  accountsByDigits: new Map([['995599000003', { user_id: 9, netai_user: false }]]),
};

describe('members.csv and aggregates_per_member.csv', () => {
  it('has one row per roster member, numbers only as hashes', () => {
    const [members, aggregates] = buildMemberFiles(INPUTS);
    expect(members.rows).toBe(2);
    expect(aggregates.rows).toBe(2);
    expect(members.body).not.toContain('995599000001');
    expect(aggregates.body).not.toContain('995599000002');
    expect(members.body).toContain(exportPhoneHash('995599000001'));
  });

  it('counts the member’s phonebook: warm, tiers, legacy colours, accounts, Axel', () => {
    const [, aggregates] = buildMemberFiles(INPUTS);
    const [header, ...rows] = aggregates.body.trim().split('\r\n');
    const cols = header.split(',');
    const row = rows
      .map((r) => r.split(','))
      .find((r) => r[cols.indexOf('member_hash')] === exportPhoneHash('995599000001'));
    const at = (c: string): string => (row ?? [])[cols.indexOf(c)];
    expect(at('contacts_total')).toBe('2');
    expect(at('contacts_tagged')).toBe('1');
    expect(at('contacts_with_facts')).toBe('1');
    expect(at('contacts_warm')).toBe('1');
    expect(at('tier_green')).toBe('1');
    expect(at('legacy_contacts')).toBe('1');
    expect(at('contacts_old_ally_accounts')).toBe('1');
    expect(at('contacts_no_account')).toBe('1');
    expect(at('contacts_axel_members')).toBe('1');
  });

  it('says in the manifest what is counted and what comes next', () => {
    const m = JSON.parse(manifest(buildMemberFiles(INPUTS), '2026-10-06T13:00:00Z').body);
    expect(m.files).toEqual([
      { name: 'members.csv', rows: 2 },
      { name: 'aggregates_per_member.csv', rows: 2 },
    ]);
    expect(m.left_out_until_the_second_delivery.length).toBeGreaterThan(0);
  });

  it('zips', async () => {
    const zip = await zipFiles(buildMemberFiles(INPUTS));
    expect(zip.subarray(0, 2).toString()).toBe('PK');
  });
});

describe('the route', () => {
  it('is admin-only and rate limited, and logs only counts', () => {
    const routes = readFileSync(
      join(__dirname, '..', '..', '..', 'api', 'routes', 'admin.routes.ts'),
      'utf8',
    );
    const at = routes.indexOf("'/exports/axel.zip'");
    expect(routes.indexOf('adminRouter.use(authenticateJwt, requireAdminRole);')).toBeLessThan(at);
    expect(routes.slice(at, at + 1200)).toContain('rateLimit(');
    expect(routes.slice(at, at + 1200)).toContain('`${f.name}=${f.rows');
  });
});
