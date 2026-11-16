jest.mock('../../db/postgres/client', () => ({ __esModule: true, query: jest.fn() }));

import { readFileSync } from 'fs';
import { join } from 'path';
import { query } from '../../db/postgres/client';
import {
  AI_NOTIFICATION_PUSH_URL,
  NudgeSubject,
  nudgePushUrl,
  nudgeSubjectOf,
} from '../aiNotification.service';

/**
 * Ops, 16 Nov 07:40Z (Misho's screenshot, a real member; his go 16 Nov): the
 * 05:00Z nudge said „someone asks to be introduced — open the app and answer"
 * and was kept in an unrelated older goal. The push text was copied into the
 * chat as is, and the chat was picked apart from what the text was about.
 */
const mockQuery = query as jest.MockedFunction<typeof query>;
const service = readFileSync(join(__dirname, '..', 'aiNotification.service.ts'), 'utf8');

beforeEach(() => mockQuery.mockReset());

describe('the chat a nudge is kept in', () => {
  it('is the introduction request’s own chat, for a nudge about the request', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ thread_id: 70001 }], rowCount: 1 } as never);
    await expect(nudgePushUrl('118509', NudgeSubject.Request)).resolves.toBe('/chat/70001');
    const [sql] = mockQuery.mock.calls[0] as [string];
    expect(sql).toContain('FROM introduction_requests r');
    expect(sql).toContain('COALESCE(r.mediator_thread_id,');
  });

  it('is the goal whose answers are awaited, for a nudge about them', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ thread_id: 70002 }], rowCount: 1 } as never);
    await expect(nudgePushUrl('118509', NudgeSubject.Waiting)).resolves.toBe('/chat/70002');
    const [sql] = mockQuery.mock.calls[0] as [string];
    expect(sql).toContain('FROM task_asks ta JOIN tasks k');
  });

  it('is never the latest unrelated conversation', () => {
    expect(service).not.toContain('SELECT t.id, 2, t.updated_at FROM threads t');
  });

  it('is none for a nudge about anything else: the push opens the chat list', async () => {
    await expect(nudgePushUrl('118509', NudgeSubject.Other)).resolves.toBe(
      AI_NOTIFICATION_PUSH_URL,
    );
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('is none when the request has no chat of its own', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ thread_id: null }], rowCount: 1 } as never);
    await expect(nudgePushUrl('118509', NudgeSubject.Request)).resolves.toBe(
      AI_NOTIFICATION_PUSH_URL,
    );
  });
});

describe('what the nudge is about', () => {
  it('is read from the model’s answer, anything unknown kept in no chat', () => {
    expect(nudgeSubjectOf('request')).toBe(NudgeSubject.Request);
    expect(nudgeSubjectOf('waiting')).toBe(NudgeSubject.Waiting);
    expect(nudgeSubjectOf('goal')).toBe(NudgeSubject.Other);
    expect(nudgeSubjectOf(undefined)).toBe(NudgeSubject.Other);
  });

  it('decides the chat the push opens and the line is kept in', () => {
    expect(service).toContain('const url = await nudgePushUrl(userId, content.about);');
    expect(service).toContain('await keepNudgeInItsChat(userId, url, content);');
  });
});

describe('the nudge’s words', () => {
  it('are no longer written to make the person open the app', () => {
    expect(service).not.toContain('მომხმარებელი გახსნის app-ს ამ notification-ის გამო');
    expect(service).toContain('არასოდეს დაწერო „გახსენი აპი", „შედი აპში" ან მსგავსი');
  });

  it('are about one thing, which the model names', () => {
    expect(service).toContain('"about": "request" | "waiting" | "other"');
  });
});
