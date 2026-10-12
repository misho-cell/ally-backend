jest.mock('../../db/postgres/client', () => ({
  __esModule: true,
  query: jest.fn(),
}));

import { query } from '../../db/postgres/client';
import { getAllEnabledTools, getEnabledToolKeys, toggleEnabledTool } from '../enabledTools.service';
import { isStaffPhone, isStaffUser, staffPhoneDigits, staffUserIds } from '../staff';

const mockQuery = query as jest.MockedFunction<typeof query>;

const ENV_KEYS = ['STAFF_USER_IDS', 'REVIEW_PHONE', 'TRUSTED_FACT_CURATOR_USER_IDS'] as const;
const FICTIONAL_PHONE = '+995 555 00 00 01';
const FICTIONAL_PHONE_OTHER_FORMAT = '995555000001';
const SAVED_ENV: Partial<Record<(typeof ENV_KEYS)[number], string>> = {};

beforeEach(() => {
  mockQuery.mockReset();
  for (const key of ENV_KEYS) {
    SAVED_ENV[key] = process.env[key];
    delete process.env[key];
  }
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (SAVED_ENV[key] === undefined) delete process.env[key];
    else process.env[key] = SAVED_ENV[key];
  }
});

describe('enabledTools.service', () => {
  it('returns only the keys of the enabled tools', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ tool_key: 'web_search' }] } as never);
    expect(await getEnabledToolKeys()).toEqual(['web_search']);
    expect(String(mockQuery.mock.calls[0][0])).toContain('is_enabled = true');
  });

  it('returns every tool row for the admin page', async () => {
    const rows = [{ tool_key: 'a', tool_label: 'A', is_enabled: false }];
    mockQuery.mockResolvedValueOnce({ rows } as never);
    expect(await getAllEnabledTools()).toEqual(rows);
  });

  it('flips one tool by a parameterised key and returns its new state', async () => {
    const row = { tool_key: 'web_search', tool_label: 'Web', is_enabled: true };
    mockQuery.mockResolvedValueOnce({ rows: [row] } as never);
    expect(await toggleEnabledTool('web_search')).toEqual(row);
    expect(mockQuery.mock.calls[0][1]).toEqual(['web_search']);
  });

  it('throws on a key that names no tool', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] } as never);
    await expect(toggleEnabledTool('nope')).rejects.toThrow('Tool not found: nope');
  });
});

describe('staff', () => {
  it('knows nobody when every list is empty', () => {
    expect(staffUserIds().size).toBe(0);
    expect(staffPhoneDigits().size).toBe(0);
    expect(isStaffUser(7)).toBe(false);
  });

  it('joins staff ids and curator ids, trimming the list', () => {
    process.env.STAFF_USER_IDS = ' 7, 8 ,';
    process.env.TRUSTED_FACT_CURATOR_USER_IDS = '9';
    expect([...staffUserIds()].sort()).toEqual(['7', '8', '9']);
    expect(isStaffUser(8)).toBe(true);
    expect(isStaffUser('9')).toBe(true);
    expect(isStaffUser(10)).toBe(false);
  });

  it('matches a review number whatever its formatting', () => {
    process.env.REVIEW_PHONE = FICTIONAL_PHONE;
    expect(isStaffPhone(FICTIONAL_PHONE_OTHER_FORMAT)).toBe(true);
    expect(isStaffPhone('+995 555 00 00 02')).toBe(false);
  });
});
