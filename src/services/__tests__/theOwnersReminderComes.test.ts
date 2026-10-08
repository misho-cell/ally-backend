jest.mock('../../db/postgres/client', () => ({ query: jest.fn(), __esModule: true }));
jest.mock('../notification.service', () => ({ sendPushNotification: jest.fn() }));
jest.mock('../sse.service', () => ({ emitMessageAppended: jest.fn() }));
jest.mock('../threads.service', () => ({
  saveServerLine: jest.fn(),
  threadLanguage: jest.fn(),
}));

import { readFileSync } from 'fs';
import { join } from 'path';
import { query } from '../../db/postgres/client';
import { sendPushNotification } from '../notification.service';
import { sweepOwnerReminders } from '../ownerReminders.cron';
import {
  claimDueReminders,
  clampReminderMinutes,
  deliverReminder,
  MAX_REMINDER_CHARS,
  MAX_REMINDER_MINUTES,
  reminderLine,
  setOwnerReminder,
} from '../ownerReminders.service';
import { emitMessageAppended } from '../sse.service';
import { saveServerLine, threadLanguage } from '../threads.service';

/**
 * #502 (§99.8), RW-005 of 7 October: „შემახსენე 15 წუთში" was answered „I
 * cannot set a reminder" inside a goal and „set a phone alarm" in a plain
 * conversation. The reminder is now a row the server delivers on time.
 */
const mockQuery = query as jest.MockedFunction<typeof query>;
const mockSave = saveServerLine as jest.MockedFunction<typeof saveServerLine>;
const mockLanguage = threadLanguage as jest.MockedFunction<typeof threadLanguage>;
const mockPush = sendPushNotification as jest.MockedFunction<typeof sendPushNotification>;
const mockEmit = emitMessageAppended as jest.MockedFunction<typeof emitMessageAppended>;
const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');

const DUE = { id: 7, user_id: 179082, thread_id: 43337, text: '⏰ წამლის დალევის დროა.' };

beforeEach(() => {
  jest.clearAllMocks();
});

describe('the reminder line and its time', () => {
  it('keeps a reminder between a minute and a week', () => {
    expect(clampReminderMinutes(15)).toBe(15);
    expect(clampReminderMinutes(0.2)).toBe(1);
    expect(clampReminderMinutes(MAX_REMINDER_MINUTES * 2)).toBe(MAX_REMINDER_MINUTES);
  });

  it('is one marked line, never two marks, never longer than the cap', () => {
    expect(reminderLine('  წამლის   დალევის\nდროა. ')).toBe('⏰ წამლის დალევის დროა.');
    expect(reminderLine('⏰ already marked')).toBe('⏰ already marked');
    expect(reminderLine('x'.repeat(MAX_REMINDER_CHARS * 2)).length).toBe(MAX_REMINDER_CHARS + 2);
  });
});

describe('storing and claiming', () => {
  it('stores the line in the conversation it was asked in, due in the minutes asked', async () => {
    mockQuery.mockResolvedValue({ rows: [], rowCount: 1 } as never);
    jest.useFakeTimers().setSystemTime(new Date('2026-10-08T10:00:00.000Z'));

    const dueAt = await setOwnerReminder({
      userId: 179082,
      threadId: 43337,
      text: 'წამლის დალევის დროა.',
      minutes: 15,
    });

    const [sql, params] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('INSERT INTO owner_reminders');
    expect(params.slice(0, 3)).toEqual([179082, 43337, '⏰ წამლის დალევის დროა.']);
    expect(dueAt.toISOString()).toBe('2026-10-08T10:15:00.000Z');
    expect(params[3]).toEqual(dueAt);
    jest.useRealTimers();
  });

  it('claims each due reminder once, with a limit', async () => {
    mockQuery.mockResolvedValue({ rows: [{ ...DUE, id: '7' }], rowCount: 1 } as never);

    expect(await claimDueReminders()).toEqual([DUE]);
    const [sql] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('SET sent_at = NOW()');
    expect(sql).toContain('sent_at IS NULL AND due_at <= NOW()');
    expect(sql).toContain('FOR UPDATE SKIP LOCKED');
    expect(sql).toContain('LIMIT $1');
  });
});

describe('delivery', () => {
  it('writes the line into the conversation, shows it live and rings the owner', async () => {
    mockSave.mockResolvedValue({
      id: 99,
      content: DUE.text,
      createdAt: '2026-10-08T10:00:00.000Z',
    });
    mockLanguage.mockResolvedValue('ka');

    await deliverReminder(DUE);

    expect(mockSave).toHaveBeenCalledWith(43337, 179082, DUE.text);
    expect(mockEmit.mock.calls[0][3]).toMatchObject({ messageId: '99', kind: 'reminder' });
    expect(mockPush).toHaveBeenCalledWith('179082', {
      title: 'Netai — შეხსენება',
      body: DUE.text,
      url: '/chat/43337',
    });
  });

  it('one failed reminder does not stop the next', async () => {
    mockQuery.mockResolvedValue({
      rows: [DUE, { ...DUE, id: 8, thread_id: 43338 }],
      rowCount: 2,
    } as never);
    mockSave
      .mockRejectedValueOnce(new Error('db down'))
      .mockResolvedValueOnce({ id: 100, content: DUE.text, createdAt: '2026-10-08T10:00:00.000Z' });
    mockLanguage.mockResolvedValue('ka');
    const quiet = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const log = jest.spyOn(console, 'log').mockImplementation(() => undefined);

    await sweepOwnerReminders();

    expect(mockSave).toHaveBeenCalledTimes(2);
    expect(mockPush).toHaveBeenCalledTimes(1);
    quiet.mockRestore();
    log.mockRestore();
  });
});

describe('the run holds the tool', () => {
  it('offers set_reminder in every conversation, and the goal wake points to it', () => {
    const list = chat.slice(chat.indexOf('export const ALWAYS_ON_TOOLS'));
    expect(list.slice(0, list.indexOf('];'))).toContain('SET_REMINDER_TOOL,');
    const wake = chat.slice(chat.indexOf("name: 'set_task_wake'"));
    expect(wake.slice(0, 700)).toContain('is set_reminder, not this');
  });

  it('tells the model never to refuse or send the owner to a phone alarm', () => {
    const tool = chat.slice(chat.indexOf("name: 'set_reminder'"));
    expect(tool.slice(0, 800)).toContain('never say you');
    expect(tool.slice(0, 800)).toContain('never suggest a phone alarm');
  });

  it('is refused in a run the owner did not start', () => {
    const handler = chat.slice(chat.indexOf('async function setReminderTool('));
    expect(handler.slice(0, 400)).toContain(
      'if (ownerAbsent) return { set: false, error: REMINDER_OWNER_ONLY }',
    );
    expect(chat).toContain(
      "case 'set_reminder':\n      return setReminderTool(userId, input, threadId, ownerAbsent);",
    );
  });
});
