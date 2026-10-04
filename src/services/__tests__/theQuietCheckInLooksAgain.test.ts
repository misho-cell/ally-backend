jest.mock('../../db/postgres/client', () => ({ __esModule: true, query: jest.fn() }));
jest.mock('../tools/searchByTag', () => ({ __esModule: true, exactMatchesWithPhones: jest.fn() }));

import { readFileSync } from 'fs';
import { join } from 'path';
import { query } from '../../db/postgres/client';
import { exactMatchesWithPhones } from '../tools/searchByTag';
import {
  goalSearchWords,
  membersJoinedSinceLastRun,
  newMembersNote,
} from '../newMembersSince.service';

/**
 * D651 (the founder, box 37654): before a quiet check-in the server reads the
 * owner's contacts who joined Netai since the goal last ran and whom the
 * goal's own search words find. Database only; none means a quiet check-in.
 */
const mockQuery = query as jest.MockedFunction<typeof query>;
const mockMatches = exactMatchesWithPhones as jest.MockedFunction<typeof exactMatchesWithPhones>;

function rows<T>(r: T[]): never {
  return { rows: r, rowCount: r.length } as never;
}

beforeEach(() => jest.clearAllMocks());

describe('the goal’s search words', () => {
  it('are what its runs searched for, newest first, each once', async () => {
    mockQuery.mockResolvedValueOnce(
      rows([
        { args_summary: 'tag_query=სანტექნიკი' },
        { args_summary: 'tag_query=plumber' },
        { args_summary: 'tag_query=სანტექნიკი' },
      ]),
    );
    await expect(goalSearchWords(38113)).resolves.toEqual(['სანტექნიკი', 'plumber']);
    const [sql, params] = mockQuery.mock.calls[0];
    expect(String(sql)).toContain('FROM tool_call_log');
    expect(params?.[0]).toBe(38113);
  });
});

describe('the contacts who joined since the goal last ran', () => {
  it('are the ones the words find and whose first conversation came after it', async () => {
    mockQuery
      .mockResolvedValueOnce(rows([{ at: '2026-10-04T19:43:04Z' }]))
      .mockResolvedValueOnce(rows([{ args_summary: 'tag_query=სანტექნიკი' }]))
      .mockResolvedValueOnce(rows([{ phone: '995500000002' }]));
    mockMatches.mockResolvedValueOnce([
      { phone: '995500000001', name: 'გელა სანტექნიკი' },
      { phone: '995500000002', name: 'ნიკა სანტექნიკი' },
    ]);
    await expect(membersJoinedSinceLastRun('501', 38113)).resolves.toEqual(['ნიკა სანტექნიკი']);
    const [sql, params] = mockQuery.mock.calls[2];
    expect(String(sql)).toContain(
      '(SELECT MIN(t.created_at) FROM threads t WHERE t.user_id = u.id) > $2',
    );
    expect(params?.[1]).toBe('2026-10-04T19:43:04Z');
  });

  it('is nobody before the goal’s first answer, or with no search words', async () => {
    mockQuery
      .mockResolvedValueOnce(rows([{ at: null }]))
      .mockResolvedValueOnce(rows([{ args_summary: 'tag_query=x' }]));
    await expect(membersJoinedSinceLastRun('501', 1)).resolves.toEqual([]);
    expect(mockMatches).not.toHaveBeenCalled();
  });
});

describe('the wake', () => {
  it('names them and asks for a plan before anyone is written to', () => {
    const note = newMembersNote(['ნიკა სანტექნიკი']);
    expect(note).toContain('ნიკა სანტექნიკი');
    expect(note).toContain('propose_task_plan');
    expect(note).toContain('გეგმის დამტკიცებამდე არავის მისწერო');
  });

  it('carries the note only when somebody joined', () => {
    const engine = readFileSync(join(__dirname, '..', 'taskEngine.service.ts'), 'utf8');
    expect(engine).toContain('joinedSinceNote(taskId),');
    expect(engine).toContain('if (names.length === 0) return null;');
  });
});
