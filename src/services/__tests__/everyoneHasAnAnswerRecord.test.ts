jest.mock('../../db/postgres/client', () => ({ query: jest.fn(), __esModule: true }));

import { readFileSync } from 'fs';
import { join } from 'path';
import { query } from '../../db/postgres/client';
import {
  answerStatsOf,
  askField,
  refreshAnswerStats,
  sweepAnswerStats,
} from '../answerStats.service';

/** 1689 (A6): a per-person answer record by field, separate counters, admin only. */
const mockQuery = query as jest.MockedFunction<typeof query>;
const src = (file: string): string => readFileSync(join(__dirname, '..', file), 'utf8');

beforeEach(() => {
  jest.clearAllMocks();
  mockQuery.mockResolvedValue({ rows: [], rowCount: 0 } as never);
});

describe('the record', () => {
  it('files an ask under the goal’s field words, not the need itself', () => {
    expect(askField('Need a customs broker for food exports')).toBe('customs broker food');
    expect(askField(null)).toBe('');
  });

  it('is recounted from the source tables, never incremented', async () => {
    await refreshAnswerStats(180279);
    const [sql, params] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('FROM task_asks ta');
    expect(sql).toContain("oe.subject_type = 'task_ask'");
    expect(sql).toContain("oe.outcome = 'worked'");
    expect(sql).toContain("mediator_user_id = $1 AND status = 'accepted'");
    expect(sql).toContain('ON CONFLICT (user_id, field) DO UPDATE SET');
    expect(sql).toContain('PERCENTILE_CONT(0.5)');
    expect(params).toEqual([180279]);
  });

  it('keeps „knows" and „answers" apart — no merged score anywhere', () => {
    const migration = readFileSync(
      join(__dirname, '..', '..', 'db', 'postgres', 'migrations', '217_answer_stats.sql'),
      'utf8',
    );
    expect(migration).not.toMatch(/\bscore\b\s+(REAL|INTEGER|NUMERIC)/);
    for (const column of [
      'asked',
      'yes',
      'no',
      'referred',
      'later',
      'silent',
      'helped',
      'bridged',
    ]) {
      expect(migration).toContain(`  ${column} `);
    }
  });

  it('the hourly sweep recounts everyone whose asks moved', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ user_id: 7 }, { user_id: 9 }],
      rowCount: 2,
    } as never);
    expect(await sweepAnswerStats()).toBe(2);
    expect(mockQuery).toHaveBeenCalledTimes(3);
  });

  it('the admin reads it, with a limit', async () => {
    await answerStatsOf(7);
    const [sql, params] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('FROM answer_stats WHERE user_id = $1');
    expect(params).toEqual([7, 50]);
  });
});

describe('it is recounted where the state changes', () => {
  it('after a first ask, after an answer, after a „helped" debrief', () => {
    const asks = src('taskAsks.service.ts');
    expect(asks).toContain('recountAnswerStats(toUserId);');
    expect(asks).toContain('recountAnswerStats(row.to_user_id);');
    expect(asks).toContain('askField(goalText) || null');
    expect(src('debrief.service.ts')).toContain(
      "if (subject === 'relayed_ask' && worked) await recountHelper(refId);",
    );
  });

  it('never reaches a user: only the admin profile carries it', () => {
    expect(src('adminUsers.service.ts')).toContain("runBlock('answerStats'");
    expect(src('chat.service.ts')).not.toContain('answer_stats');
    expect(src('chat.service.ts')).not.toContain('answerStats');
  });
});
