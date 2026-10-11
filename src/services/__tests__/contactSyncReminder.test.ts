jest.mock('../../db/postgres/client', () => ({ __esModule: true, query: jest.fn() }));
jest.mock('../notification.service', () => ({ __esModule: true, sendPushNotification: jest.fn() }));
jest.mock('../threads.service', () => ({ __esModule: true, userLanguage: jest.fn() }));

import { readFileSync } from 'fs';
import { join } from 'path';
import { query } from '../../db/postgres/client';
import { syncReminderPush, SYNC_REMINDER_DAYS, SYNC_REMINDER_URL } from '../contactSyncReminder';
import { sendDueSyncReminders } from '../contactSyncReminder.service';
import { sendPushNotification } from '../notification.service';
import { userLanguage } from '../threads.service';

/** BH (§128): the monthly „sync your contacts again" push, approved word for word. */
const mockQuery = query as jest.MockedFunction<typeof query>;
const mockPush = sendPushNotification as jest.MockedFunction<typeof sendPushNotification>;
const mockLanguage = userLanguage as jest.MockedFunction<typeof userLanguage>;

beforeEach(() => {
  mockQuery.mockReset();
  mockPush.mockReset().mockResolvedValue(undefined);
  mockLanguage.mockReset().mockResolvedValue('ka');
});

describe('syncReminderPush', () => {
  it('says the approved Georgian line and opens the sync page', () => {
    expect(syncReminderPush('ka')).toEqual({
      title: 'Netai',
      body: 'ერთი თვე გავიდა მას შემდეგ, რაც კონტაქტები ბოლოს გაანახლე. განაახლე, რომ ახალი ნაცნობებიც შენს ქსელში იყვნენ.',
      url: SYNC_REMINDER_URL,
    });
  });

  it('has the approved line in each language', () => {
    expect(syncReminderPush('en').body).toBe(
      'It has been a month since you last synced your contacts. Sync again so the people you met since are in your network too.',
    );
    expect(syncReminderPush('ru').body).toContain('Прошёл месяц');
    expect(syncReminderPush('es').body).toContain('Ha pasado un mes');
  });
});

describe('sendDueSyncReminders', () => {
  it('claims the due people in one statement and rings each in their language', async () => {
    mockQuery.mockResolvedValue({ rows: [{ id: 7 }, { id: 8 }], rowCount: 2 } as never);
    mockLanguage.mockResolvedValueOnce('ka').mockResolvedValueOnce('en');
    await expect(sendDueSyncReminders()).resolves.toBe(2);
    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).toContain('UPDATE "User" u SET contact_import_reminded_at = NOW()');
    expect(sql).toContain('WHERE u2.contact_import_reminder');
    expect(sql).toContain('ia.imported > 0 AND NOT ia.in_progress');
    expect(sql).toContain('EXTRACT(HOUR FROM NOW() AT TIME ZONE COALESCE(ps.time_zone, $2)) = $3');
    expect(params).toEqual([SYNC_REMINDER_DAYS, 'Asia/Tbilisi', 12, 200]);
    expect(mockPush).toHaveBeenNthCalledWith(1, '7', syncReminderPush('ka'));
    expect(mockPush).toHaveBeenNthCalledWith(2, '8', syncReminderPush('en'));
  });

  it('rings nobody when nobody is due', async () => {
    mockQuery.mockResolvedValue({ rows: [], rowCount: 0 } as never);
    await expect(sendDueSyncReminders()).resolves.toBe(0);
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('keeps going when one push fails', async () => {
    mockQuery.mockResolvedValue({ rows: [{ id: 7 }, { id: 8 }], rowCount: 2 } as never);
    mockPush.mockRejectedValueOnce(new Error('gone'));
    await expect(sendDueSyncReminders()).resolves.toBe(1);
  });

  it('is started with the other timers', () => {
    const index = readFileSync(join(__dirname, '..', '..', 'index.ts'), 'utf8');
    expect(index).toContain('    startContactSyncReminders();\n');
  });
});
