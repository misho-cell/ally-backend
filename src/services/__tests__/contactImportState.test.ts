jest.mock('../../db/postgres/client', () => ({ __esModule: true, query: jest.fn() }));

import { query } from '../../db/postgres/client';
import { contactImportState, setContactImportReminder } from '../contactImportState.service';

const mockQuery = query as jest.MockedFunction<typeof query>;

beforeEach(() => mockQuery.mockReset());

/** The frontend's 06:30Z item 7: the contact sync page's numbers. */
describe('contactImportState', () => {
  it('reads the last import that brought contacts, the count held now, and the switch', async () => {
    mockQuery.mockResolvedValue({
      rows: [
        {
          last_import_at: '2026-10-01T09:00:00Z',
          last_import_count: 412,
          count: 420,
          monthly_reminder: true,
        },
      ],
    } as never);

    await expect(contactImportState(171)).resolves.toEqual({
      last_import_at: '2026-10-01T09:00:00Z',
      last_import_count: 412,
      count: 420,
      monthly_reminder: true,
    });
    const [sql, params] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('ia.imported > 0 AND NOT ia.in_progress');
    expect(sql).toContain('LIMIT 1');
    expect(params).toEqual([171]);
  });

  it('answers a person who never imported with nulls and zeros, the switch off', async () => {
    mockQuery.mockResolvedValue({
      rows: [{ last_import_at: null, last_import_count: null, count: 0, monthly_reminder: null }],
    } as never);
    await expect(contactImportState(171)).resolves.toEqual({
      last_import_at: null,
      last_import_count: 0,
      count: 0,
      monthly_reminder: false,
    });
  });
});

describe('setContactImportReminder', () => {
  it('writes the person’s own row only, as a bound parameter', async () => {
    mockQuery.mockResolvedValue({ rows: [] } as never);
    await setContactImportReminder(171, true);
    const [sql, params] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('UPDATE "User" SET contact_import_reminder = $2 WHERE id = $1');
    expect(params).toEqual([171, true]);
  });
});
