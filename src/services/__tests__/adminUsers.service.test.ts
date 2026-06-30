jest.mock('../../db/postgres/client', () => ({ query: jest.fn(), __esModule: true }));
jest.mock('../../db/neo4j/client', () => ({ getSession: jest.fn(), __esModule: true }));
jest.mock('../neo4j.keys', () => ({
  getCompositeKeyForUser: jest.fn().mockResolvedValue('key-1'),
  __esModule: true,
}));

import { query } from '../../db/postgres/client';
import { getSession } from '../../db/neo4j/client';
import { listUsers, getAdminUserDetail } from '../adminUsers.service';

const mockQuery = query as jest.MockedFunction<typeof query>;
const mockGetSession = getSession as jest.MockedFunction<typeof getSession>;

function rows(data: unknown[]): { rows: unknown[]; rowCount: number } {
  return { rows: data, rowCount: data.length };
}

// Route detail-page queries by a distinctive SQL fragment (Promise.all → order
// is not deterministic).
function routeDetail(sql: string): { rows: unknown[]; rowCount: number } {
  // Timeline query also embeds `FROM "User" WHERE id = $1` in a subselect, so
  // match its unique `AS first_import` fragment before the account check.
  if (sql.includes('AS first_import'))
    return rows([
      {
        signup: '2026-01-01',
        first_import: '2026-01-03',
        first_search: '2026-02-01',
        first_intro: null,
        first_nudge: null,
        last_active: '2026-06-30',
      },
    ]);
  if (sql.includes('FROM "User" WHERE id = $1'))
    return rows([
      {
        id: 7,
        name: 'ლიკა',
        email: null,
        jobPosition: 'CEO',
        employer: 'Ally',
        city: 'Tbilisi',
        createdAt: '2026-01-01',
        deletedAt: null,
        subscription_tier: 'pro',
        subscription_status: 'active',
        trial_ends_at: null,
        current_period_ends_at: null,
        paddle_customer_id: 'cus_1',
      },
    ]);
  if (sql.includes('FROM "UserPhone" WHERE "userId" = $1 ORDER BY phone'))
    return rows([{ phone: '+995555' }]);
  if (sql.includes('AS contacts'))
    return rows([{ contacts: '311', tags: '40', blocked: '2', deceased: '1' }]);
  if (sql.includes('AS threads'))
    return rows([{ threads: '3', messages: '88', first_at: '2026-01-02', last_at: '2026-06-30' }]);
  if (sql.includes('GROUP BY DATE(created_at)')) return rows([{ day: '2026-06-30', count: '4' }]);
  if (sql.includes('FILTER (WHERE flagged)'))
    return rows([{ total: '50', flagged: '1', successful: '37' }]);
  if (sql.includes('tool AS label')) return rows([{ label: 'name', count: '30' }]);
  if (sql.includes('query, tool, flagged, result_count'))
    return rows([
      { query: 'gio', tool: 'name', flagged: false, result_count: 4, created_at: '2026-06-30' },
    ]);
  if (sql.includes('status AS label')) return rows([{ label: 'accepted', count: '5' }]);
  if (sql.includes('mediator_user_id = $1')) return rows([{ count: '2' }]);
  if (sql.includes('FROM contact_insights')) return rows([{ count: '13' }]);
  if (sql.includes('FROM contact_facts')) return rows([{ count: '23' }]);
  if (sql.includes('FROM user_profile_kv'))
    return rows([{ key: 'role', value: 'founder', updated_at: '2026-06-01' }]);
  if (sql.includes('FROM user_private_context')) return rows([]);
  if (sql.includes('FROM ai_notification_log')) return rows([{ count: '9' }]);
  if (sql.includes('FROM ai_notification_settings'))
    return rows([
      {
        frequency_days: 1,
        last_sent_at: '2026-06-29',
        consecutive_no_opens: 0,
        paused_until: null,
        distress_until: null,
      },
    ]);
  if (sql.includes('FROM device_fingerprints'))
    return rows([
      {
        device_id: 'd1',
        user_agent: 'iOS',
        ip: '1.2.3.4',
        request_count: 42,
        first_seen: '2026-01-01',
        last_seen: '2026-06-30',
      },
    ]);
  if (sql.includes('FROM push_subscriptions')) return rows([{ count: '1' }]);
  throw new Error(`Unexpected query: ${sql}`);
}

function fakeNeo4jSession(): ReturnType<typeof getSession> {
  const record = {
    get: (key: string): { toNumber: () => number } =>
      key === 'first_degree' ? { toNumber: () => 250 } : { toNumber: () => 4100 },
  };
  return {
    run: jest.fn().mockResolvedValue({ records: [record] }),
    close: jest.fn().mockResolvedValue(undefined),
  } as unknown as ReturnType<typeof getSession>;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGetSession.mockReturnValue(fakeNeo4jSession());
});

describe('listUsers', () => {
  it('maps rows and caps the limit', async () => {
    mockQuery.mockResolvedValueOnce(
      rows([
        {
          id: 7,
          name: 'ლიკა',
          city: 'Tbilisi',
          subscription_status: 'active',
          created_at: '2026-01-01',
          last_active: '2026-06-30',
          contacts_count: '311',
          phones: ['+995555'],
        },
      ]) as never,
    );

    const result = await listUsers('lika', 9999);

    expect(result).toEqual([
      {
        id: 7,
        name: 'ლიკა',
        phones: ['+995555'],
        city: 'Tbilisi',
        subscriptionStatus: 'active',
        createdAt: '2026-01-01',
        lastActiveAt: '2026-06-30',
        contactsCount: 311,
      },
    ]);
    expect(mockQuery.mock.calls[0][1]).toEqual(['lika', '%lika%', 100]);
  });
});

describe('getAdminUserDetail', () => {
  it('returns null when the user does not exist', async () => {
    mockQuery.mockImplementation((sql: string) => {
      if (sql.includes('FROM "User" WHERE id = $1')) return Promise.resolve(rows([]) as never);
      return Promise.resolve(rows([]) as never);
    });

    const result = await getAdminUserDetail(999);

    expect(result).toBeNull();
  });

  it('assembles a full profile across all blocks', async () => {
    mockQuery.mockImplementation((sql: string) => Promise.resolve(routeDetail(sql) as never));

    const profile = await getAdminUserDetail(7);

    expect(profile?.account.name).toBe('ლიკა');
    expect(profile?.account.phones).toEqual(['+995555']);
    expect(profile?.network.contactsCount).toBe(311);
    expect(profile?.network.firstDegree).toBe(250);
    expect(profile?.network.secondDegree).toBe(4100);
    expect(profile?.activity.messageCount).toBe(88);
    expect(profile?.searches.totalSearches).toBe(50);
    expect(profile?.searches.flaggedCount).toBe(1);
    expect(profile?.searches.successfulSearches).toBe(37);
    expect(profile?.searches.recent[0].resultCount).toBe(4);
    expect(profile?.outcomes.introRequestsMade).toBe(5);
    expect(profile?.outcomes.factsSubmitted).toBe(23);
    expect(profile?.memory.profile).toEqual([
      { key: 'role', value: 'founder', updatedAt: '2026-06-01' },
    ]);
    expect(profile?.devices.devices[0].deviceId).toBe('d1');
    expect(profile?.devices.pushSubscriptionsCount).toBe(1);
    // Timeline drops null milestones and sorts ascending.
    expect(profile?.timeline.map((e) => e.type)).toEqual([
      'signup',
      'first_import',
      'first_search',
      'last_active',
    ]);
  });

  it('degrades neo4j reach to null when the graph query fails', async () => {
    mockQuery.mockImplementation((sql: string) => Promise.resolve(routeDetail(sql) as never));
    const failing = {
      run: jest.fn().mockRejectedValue(new Error('neo4j down')),
      close: jest.fn().mockResolvedValue(undefined),
    } as unknown as ReturnType<typeof getSession>;
    mockGetSession.mockReturnValue(failing);

    const profile = await getAdminUserDetail(7);

    expect(profile?.network.firstDegree).toBeNull();
    expect(profile?.network.secondDegree).toBeNull();
    expect(profile?.network.contactsCount).toBe(311);
  });
});
