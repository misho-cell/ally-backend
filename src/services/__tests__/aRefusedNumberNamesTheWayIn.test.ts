import { readFileSync } from 'fs';
import { join } from 'path';

jest.mock('../../db/postgres/client', () => ({ __esModule: true, query: jest.fn() }));

import { query } from '../../db/postgres/client';
import { bridgesHolding } from '../numberBridges';

const mockQuery = query as jest.MockedFunction<typeof query>;

/**
 * 5286 (Lika №181): a second-circle number was rightly kept back, and no
 * introduction was offered. The refusal now names the owner's own contacts on
 * Netai who hold that number.
 */
describe('who holds a number the owner may not see', () => {
  beforeEach(() => mockQuery.mockReset());

  it('reads the owner’s contacts on Netai who saved that number, in the owner’s spelling', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ name: 'ბესო' }, { name: '  ' }] } as never);
    expect(await bridgesHolding('7', '+995 5')).toEqual(['ბესო']);
    const [sql, params, timeout] = mockQuery.mock.calls[0];
    expect(sql).toContain('WHERE mine."contactId" = $1::int');
    expect(sql).toContain('ON theirs."contactId" = bu.id');
    expect(sql).toContain('bu."deletedAt" IS NULL');
    expect(sql).toContain('sv_ua."contactId" = $1::int');
    expect(sql).toMatch(/LIMIT \d+/u);
    expect(params).toEqual(['7', '+995 5']);
    expect(timeout).toBeGreaterThan(0);
  });

  it('is empty, never an error, when the read fails', async () => {
    mockQuery.mockRejectedValueOnce(new Error('timeout'));
    expect(await bridgesHolding('7', '1')).toEqual([]);
  });
});

describe('the refusal', () => {
  const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');

  it('carries the names beside the same sentence, only when there are some', () => {
    const at = chat.indexOf('if (ownRow.rows.length === 0) {');
    const branch = chat.slice(at, at + 500);
    expect(branch).toContain('const through = await bridgesHolding(userId, phone);');
    expect(branch).toContain("'Offer request_introduction instead.'");
    expect(branch).toContain('...(through.length > 0 && { introduce_through: through })');
  });
});
