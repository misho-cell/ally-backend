jest.mock('../../db/postgres/client', () => ({ query: jest.fn(), __esModule: true }));

import { query } from '../../db/postgres/client';
import { BASE_EXPORT_COLUMNS, csvLine, streamBaseExport } from '../baseExport.service';

const mockQuery = query as jest.MockedFunction<typeof query>;

function rows(data: unknown[]): { rows: unknown[]; rowCount: number } {
  return { rows: data, rowCount: data.length };
}

beforeEach(() => jest.clearAllMocks());

describe('the file', () => {
  it('escapes quotes and commas so a label cannot break a row', () => {
    expect(csvLine(['a', 'he said "hi", twice'])).toBe('"a","he said ""hi"", twice"\n');
  });

  it('carries no full phone number — only the last four digits', () => {
    expect([...BASE_EXPORT_COLUMNS]).toContain('phone_last4');
    expect([...BASE_EXPORT_COLUMNS]).not.toContain('phone');
  });

  it('writes the header first, then one row per account, batch after batch', async () => {
    const ids = [[1, 2], []]; // two accounts, then the end
    mockQuery.mockImplementation((sql: string) => {
      if (sql.startsWith('SELECT id FROM "User"'))
        return Promise.resolve(rows((ids.shift() ?? []).map((id) => ({ id }))) as never);
      if (sql.includes('FROM "User" WHERE id = ANY'))
        return Promise.resolve(
          rows([
            {
              id: 1,
              createdAt: '2023-12-01T00:00:00Z',
              lastLoginAt: null,
              boughtPremiumMapAt: '2024-01-05T00:00:00Z',
              cancelledPremiumMapAt: null,
              subscription_tier: 'free',
              subscription_status: 'inactive',
              current_period_ends_at: null,
              city: 'Tbilisi',
              jobPosition: 'CFO',
              employer: 'Tera',
              linkedin: null,
              linkedinCountry: 'Georgia',
              invite_cohort: null,
            },
            {
              id: 2,
              createdAt: '2026-09-01T00:00:00Z',
              lastLoginAt: null,
              boughtPremiumMapAt: null,
              cancelledPremiumMapAt: null,
              subscription_tier: 'pro',
              subscription_status: 'active',
              current_period_ends_at: '2026-10-01T00:00:00Z',
              city: null,
              jobPosition: null,
              employer: null,
              linkedin: null,
              linkedinCountry: null,
              invite_cohort: 'AXEL2026',
            },
          ]) as never,
        );
      if (sql.includes('FROM "UserPhone"'))
        return Promise.resolve(
          rows([
            { userId: 1, phones: ['+995599111222'] },
            { userId: 2, phones: ['+995599333444'] },
          ]) as never,
        );
      if (sql.includes('FROM "UserAlias"') && sql.includes('"contactId" = ANY'))
        return Promise.resolve(rows([{ contactId: 1, n: '2380' }]) as never);
      if (sql.includes('FROM "UserAlias" ua'))
        return Promise.resolve(
          rows([
            { phone: '+995599111222', reach: '12', labels: '5', sample: ['Jaba Axel', 'Jaba'] },
          ]) as never,
        );
      if (sql.includes('FROM threads'))
        return Promise.resolve(
          rows([
            { user_id: 2, n: '4', first: '2026-09-02T00:00:00Z', last: '2026-09-06T00:00:00Z' },
          ]) as never,
        );
      if (sql.includes('FROM contact_facts'))
        return Promise.resolve(
          rows([
            {
              neo4j_contact_id: '+995599111222',
              field_type: 'occupation',
              value: 'CFO @ Tera Leasing',
            },
          ]) as never,
        );
      return Promise.resolve(rows([]) as never);
    });

    const chunks: string[] = [];
    const written = await streamBaseExport((c) => chunks.push(c), { batch: 500 });

    expect(written).toBe(2);
    const lines = chunks.join('').trim().split('\n');
    expect(lines).toHaveLength(3);
    expect(lines[0]).toBe(csvLine(BASE_EXPORT_COLUMNS).trim());
    const one = Object.fromEntries(
      BASE_EXPORT_COLUMNS.map((c, i) => [c, lines[1]?.split('","')[i]?.replace(/^"|"$/g, '')]),
    );
    expect(one.account_id).toBe('1');
    expect(one.phone_last4).toBe('1222');
    expect(one.contacts_imported).toBe('2380');
    expect(one.old_ally_paid).toBe('yes');
    expect(one.account_state).toBe('ally_account');
    expect(one.netai_subscriber).toBe('no');
    expect(one.reach_phonebooks).toBe('12');
    expect(one.label_sample).toBe('Jaba Axel | Jaba');
    expect(one.job_title).toBe('CFO @ Tera Leasing');
    const two = Object.fromEntries(
      BASE_EXPORT_COLUMNS.map((c, i) => [c, lines[2]?.split('","')[i]?.replace(/^"|"$/g, '')]),
    );
    expect(two.account_state).toBe('netai_user');
    expect(two.netai_subscriber).toBe('yes');
    expect(two.netai_threads).toBe('4');
    expect(two.invite_cohort).toBe('AXEL2026');
    // No full number anywhere in the file.
    expect(chunks.join('')).not.toContain('599111222');
  });
});
