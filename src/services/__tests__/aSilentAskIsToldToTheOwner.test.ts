jest.mock('../../db/postgres/client', () => ({ __esModule: true, query: jest.fn() }));

import { readFileSync } from 'fs';
import { join } from 'path';
import { query } from '../../db/postgres/client';
import {
  SILENT_ASK_DAYS,
  claimSilentAsksToTell,
  silentAsksNote,
  wakeGoalsWithSilentAsks,
} from '../askSilence.service';

/**
 * Board #7760: an ask nobody answers sat as „sent" until the two-week expiry.
 * After SILENT_ASK_DAYS the asker's goal is woken once per ask with a factual
 * line. Structure only (days since the ask row). Fictional ids and names.
 */
const mockQuery = query as jest.MockedFunction<typeof query>;
const rows = (r: unknown[]): never => ({ rows: r, rowCount: r.length }) as never;

beforeEach(() => mockQuery.mockReset());

describe('which asks count as silent', () => {
  it('sent, not expired, not told, the owner’s own, past the days, not under „later", open goal, no steps', async () => {
    mockQuery.mockResolvedValueOnce(rows([]));
    await wakeGoalsWithSilentAsks();
    const [sql, params] = mockQuery.mock.calls[0];
    for (const part of [
      "a.status = 'sent'",
      'a.expired_at IS NULL',
      'a.silence_told_at IS NULL',
      'a.parent_ask_id IS NULL',
      'make_interval(days => $1)',
      'a.later_until IS NULL OR a.later_until <= NOW()',
      "t.status = 'open'",
      "COALESCE(jsonb_typeof(t.plan->'steps'), '') <> 'array'",
      'LIMIT $2',
    ]) {
      expect(sql).toContain(part);
    }
    expect((params as unknown[])[0]).toBe(SILENT_ASK_DAYS);
  });

  it('pulls each such goal’s wake to now', async () => {
    mockQuery
      .mockResolvedValueOnce(rows([{ task_id: 7001 }, { task_id: 7002 }]))
      .mockResolvedValue({ rows: [], rowCount: 1 } as never);
    await expect(wakeGoalsWithSilentAsks(new Date('2026-11-05T12:00:00Z'))).resolves.toBe(2);
    expect(mockQuery.mock.calls[1][0]).toContain('UPDATE tasks SET next_wake_at = $2');
  });
});

describe('telling the owner', () => {
  it('claims the names once, stamping silence_told_at', async () => {
    mockQuery.mockResolvedValueOnce(rows([{ name: 'ანა ტესტაძე' }, { name: null }]));
    await expect(claimSilentAsksToTell(7001)).resolves.toEqual(['ანა ტესტაძე', 'კონტაქტი']);
    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).toContain('SET silence_told_at = NOW()');
    expect(params).toEqual([SILENT_ASK_DAYS, 7001, 20]);
  });

  it('is one factual line with the next step left to the run, or nothing', () => {
    const note = silentAsksNote(['ანა ტესტაძე', 'ანა ტესტაძე']) ?? '';
    expect(note).toContain(`${SILENT_ASK_DAYS} დღეა კითხვაზე არ უპასუხიათ: ანა ტესტაძე.`);
    expect(note).toContain('რა არის შემდეგი ნაბიჯი');
    expect(note).toContain('ხელახლა ნუ მისწერ ცალკე თანხმობის გარეშე');
    expect(silentAsksNote([])).toBeNull();
  });

  it('rides the scheduled wake, and the sweep runs after the expiry', () => {
    const engine = readFileSync(join(__dirname, '..', 'taskEngine.service.ts'), 'utf8');
    expect(engine).toContain(
      'const notes = [heldText, elsewhere, expired, silent, joined, lastReply]',
    );
    expect(engine).toContain('.then(() => wakeGoalsWithSilentAsks())');
  });
});
