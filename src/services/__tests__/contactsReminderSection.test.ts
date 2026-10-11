jest.mock('../../db/postgres/client', () => ({ __esModule: true, query: jest.fn() }));

import { readFileSync } from 'fs';
import { join } from 'path';
import { query } from '../../db/postgres/client';
import { CONTACTS_REMINDER_SECTION, contactsReminderSection } from '../contactsReminderSection';

/** BJ (D771, §128): the monthly contacts reminder in the assistant's own words. */
const mockQuery = query as jest.MockedFunction<typeof query>;
const OWN_RUN = { ownerPresent: true, regularThread: true, goalBound: false, preview: false };

beforeEach(() => mockQuery.mockReset());

describe('contactsReminderSection', () => {
  it('adds the approved section when this month’s reminder is claimed', async () => {
    mockQuery.mockResolvedValue({ rows: [{ id: 7 }], rowCount: 1 } as never);
    await expect(contactsReminderSection('7', OWN_RUN, false)).resolves.toBe(
      CONTACTS_REMINDER_SECTION,
    );
    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).toContain('UPDATE "User" u SET contact_import_reminded_at = NOW()');
    expect(sql).toContain('u.contact_import_reminder');
    expect(params).toEqual(['7', 30]);
  });

  it('adds nothing when it is not due', async () => {
    mockQuery.mockResolvedValue({ rows: [], rowCount: 0 } as never);
    await expect(contactsReminderSection('7', OWN_RUN, false)).resolves.toBe('');
  });

  it('never rides beside the day’s question, in a goal, or without the owner', async () => {
    await expect(contactsReminderSection('7', OWN_RUN, true)).resolves.toBe('');
    await expect(
      contactsReminderSection('7', { ...OWN_RUN, goalBound: true }, false),
    ).resolves.toBe('');
    await expect(
      contactsReminderSection('7', { ...OWN_RUN, ownerPresent: false }, false),
    ).resolves.toBe('');
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('fails towards nothing when the read fails', async () => {
    mockQuery.mockRejectedValue(new Error('timeout'));
    await expect(contactsReminderSection('7', OWN_RUN, false)).resolves.toBe('');
  });

  it('is the approved text, and goes into the owner’s run after the day’s question', () => {
    expect(CONTACTS_REMINDER_SECTION).toContain('## კონტაქტების განახლება (D771)');
    expect(CONTACTS_REMINDER_SECTION).toContain('ერთხელ, მოკლედ, ღილაკის გარეშე.');
    const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
    expect(chat).toContain('      contactQuestion +\n      contactsReminder +\n');
  });
});
