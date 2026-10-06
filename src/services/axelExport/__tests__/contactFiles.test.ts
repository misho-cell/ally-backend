import { contactIndex, contactRow, viaWarmth, type RowContext } from '../contactFiles';
import { memberToMember, reachSummary, sharedContacts, tagFrequency } from '../crossingFiles';
import { labelParts, labelScript, namesSeniorRole } from '../labelParts';
import { ownerIndex, type MemberInputs } from '../memberFiles';
import { exportPhoneHash } from '../exportHash';

/** The Axel export, parts B and C (Misho, 6 Oct). */
const saved = process.env.MCP_REF_SECRET;
beforeAll(() => {
  process.env.MCP_REF_SECRET = 'test-secret';
});
afterAll(() => {
  if (saved === undefined) delete process.env.MCP_REF_SECRET;
  else process.env.MCP_REF_SECRET = saved;
});

describe('the label', () => {
  it('names its script and finds a senior role in either language', () => {
    expect(labelScript('Nino Beridze')).toBe('latin');
    expect(labelScript('ნინო ბერიძე')).toBe('georgian');
    expect(labelScript('Nino ბერიძე')).toBe('mixed');
    expect(namesSeniorRole('Giorgi CEO TBC')).toBe(true);
    expect(namesSeniorRole('გიორგი დირექტორი')).toBe(true);
    expect(namesSeniorRole('Nino dentist')).toBe(false);
  });

  it('reads a first name from the label', () => {
    expect(labelParts('Giorgi Beridze').first_name).toBe('Giorgi');
  });
});

describe('via_warmth, the product’s own rule', () => {
  it('starts at 0.3, adds its signals and stops at 0.95', () => {
    expect(
      viaWarmth({ score: null, tags: 0, ownFact: false, answeredAsk: false, tie: false }),
    ).toBe(0.3);
    expect(viaWarmth({ score: null, tags: 2, ownFact: true, answeredAsk: false, tie: false })).toBe(
      0.5,
    );
    expect(viaWarmth({ score: 0.9, tags: 4, ownFact: true, answeredAsk: true, tie: true })).toBe(
      0.95,
    );
  });
});

const ov = (owner: number, d: string, value: string) => ({
  owner_id: owner,
  contact_digits: d,
  value,
});
const MEMBERS: MemberInputs = {
  roster: [
    {
      user_id: 1,
      name: 'a',
      phone: '995599000001',
      on_netai: true,
      group: 'Axel',
      match_names: [],
    },
    {
      user_id: 2,
      name: 'b',
      phone: '995599000002',
      on_netai: true,
      group: 'Axel',
      match_names: [],
    },
  ],
  accounts: new Map(),
  activity: new Map(),
  phonebooks: [
    {
      owner_id: 1,
      contact_digits: '995599000002',
      label: 'Bacho CEO',
      saved_at: null,
      source: null,
    },
    { owner_id: 2, contact_digits: '995599000001', label: 'Ana', saved_at: null, source: null },
    { owner_id: 1, contact_digits: '995599000009', label: 'Shared', saved_at: null, source: null },
    {
      owner_id: 2,
      contact_digits: '995599000009',
      label: 'Shared too',
      saved_at: null,
      source: null,
    },
  ],
  tags: [ov(1, '995599000002', 'investor|USER_CREATED')],
  scores: [],
  tiers: [ov(1, '995599000002', 'green')],
  legacy: [],
  statedClose: [],
  digitsWithFacts: new Set(),
  accountsByDigits: new Map([
    ['995599000001', { user_id: 1, netai_user: true }],
    ['995599000002', { user_id: 2, netai_user: true }],
  ]),
};

function ctx(): RowContext {
  return {
    members: MEMBERS,
    idx: ownerIndex(MEMBERS),
    cidx: contactIndex({
      facts: [],
      insights: [],
      exclusions: [],
      blocks: [],
      warmth: [],
      intros: [],
      invites: [],
      ties: [],
      asks: [{ owner_id: 1, to_user_id: 2, status: 'answered', declined: false, later: false }],
      enrichment: new Map(),
    }),
    enrichment: new Map(),
    rosterKeyByDigits: new Map([
      ['995599000001', 1],
      ['995599000002', 2],
    ]),
    rosterKeyByUserId: new Map([
      [1, 1],
      [2, 2],
    ]),
  };
}

describe('contacts.csv rows and the crossings', () => {
  // Built after beforeAll has set the secret, so every hash uses the test key.
  let rows: ReturnType<typeof contactRow>[] = [];
  beforeAll(() => {
    rows = MEMBERS.phonebooks.map((r) => contactRow(r, ctx()));
  });

  it('carries the owner, the hashed contact, tags, warmth and the asks, never a number', () => {
    const first = rows[0];
    expect(first.contact_hash).toBe(exportPhoneHash('995599000002'));
    expect(JSON.stringify(rows)).not.toContain('995599000002');
    expect(first.owner_roster_key).toBe(1);
    expect(first.contact_roster_key).toBe(2);
    expect(first.tags).toBe('investor');
    expect(first.warm).toBe(true);
    expect(first.asks_answered).toBe(1);
    expect(first.senior_role).toBe(true);
  });

  it('pairs members both ways, and finds the contact two members share', () => {
    const pairs = memberToMember(rows);
    expect(pairs).toHaveLength(2);
    expect(pairs.every((p) => p.x_in_y_phonebook === true)).toBe(true);
    const shared = sharedContacts(rows);
    expect(shared.filter((s) => s.contact_hash === exportPhoneHash('995599000009'))).toHaveLength(
      2,
    );
  });

  it('counts the reach and the tags across the roster', () => {
    const reach = Object.fromEntries(reachSummary(rows).map((r) => [r.measure, r.value]));
    expect(reach.phonebook_rows).toBe(4);
    expect(reach.distinct_people).toBe(3);
    expect(reach.saved_by_2_or_more_members).toBe(1);
    expect(tagFrequency(rows)).toEqual([{ tag: 'investor', contacts: 1, members_using: 1 }]);
  });
});
