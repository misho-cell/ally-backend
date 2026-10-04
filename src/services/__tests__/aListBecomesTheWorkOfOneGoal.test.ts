jest.mock('../../db/postgres/client', () => ({ __esModule: true, query: jest.fn() }));
jest.mock('../openingSearch.service', () => ({ __esModule: true, findWaysIn: jest.fn() }));

import { readFileSync } from 'fs';
import { join } from 'path';
import { query } from '../../db/postgres/client';
import { findWaysIn } from '../openingSearch.service';
import {
  ListItemState,
  listStatus,
  nameColumn,
  startListWork,
  stateOf,
} from '../listItems.service';

/**
 * Board #893 (the founder, 4 October): every row of an uploaded list becomes an
 * item of ONE goal with its own way in and state. Nothing is sent here.
 */
const mockQuery = query as jest.MockedFunction<typeof query>;
const mockWaysIn = findWaysIn as jest.MockedFunction<typeof findWaysIn>;

beforeEach(() => {
  mockQuery.mockReset();
  mockWaysIn.mockReset();
});

describe('the column a row is called by', () => {
  it('is the one whose header names it', () => {
    expect(nameColumn(['ქალაქი', 'კომპანია', 'საიტი'])).toBe(1);
    expect(nameColumn(['City', 'Company name'])).toBe(1);
  });

  it('is the first one when no header names it', () => {
    expect(nameColumn(['A', 'B'])).toBe(0);
  });
});

describe('a row’s state from its way in', () => {
  it('is a route, no route, or unchecked — never „nobody" for a lookup that did not finish', () => {
    expect(stateOf({ kind: 'first_circle', who: 'Nino' })).toBe(ListItemState.RouteFound);
    expect(stateOf({ kind: 'none' })).toBe(ListItemState.NoRoute);
    expect(stateOf({ kind: 'unchecked' })).toBe(ListItemState.Unchecked);
    expect(stateOf(undefined)).toBe(ListItemState.Unchecked);
  });
});

describe('starting work on a list', () => {
  it('refuses a file that is not in this owner’s open goal’s conversation', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 } as never);
    const outcome = await startListWork('501', 10, 7);
    expect(outcome.ok).toBe(false);
    const [sql, params] = mockQuery.mock.calls[0];
    expect(String(sql)).toContain('JOIN tasks t ON t.thread_id = f.thread_id');
    expect(String(sql)).toContain("t.status = 'open'");
    expect(params).toEqual([7, 10, '501']);
    expect(mockWaysIn).not.toHaveBeenCalled();
  });

  it('looks up every row’s way in once, in one call, and stores the items in one statement', async () => {
    mockQuery
      .mockResolvedValueOnce({
        rows: [
          {
            columns: ['ქალაქი', 'კომპანია'],
            rows: [
              ['თბილისი', 'Acme'],
              ['ბათუმი', 'Beta'],
              ['', ''],
            ],
          },
        ],
        rowCount: 1,
      } as never)
      .mockResolvedValueOnce({ rows: [], rowCount: 2 } as never);
    mockWaysIn.mockResolvedValueOnce(
      new Map([
        ['Acme', { kind: 'first_circle' as const, who: 'ნინო' }],
        ['Beta', { kind: 'none' as const }],
      ]),
    );
    const outcome = await startListWork('501', 10, 7, { threadId: 30, runId: 'r' });
    if (!outcome.ok) throw new Error(outcome.error);
    expect(mockWaysIn).toHaveBeenCalledWith('501', ['Acme', 'Beta'], { threadId: 30, runId: 'r' });
    expect(outcome.value.total).toBe(2);
    expect(outcome.value.counts).toEqual({ route_found: 1, no_route: 1 });
    expect(outcome.value.items[0]).toEqual({
      row: 1,
      label: 'Acme',
      state: ListItemState.RouteFound,
      throughWhom: 'ნინო',
    });
    const [insert] = mockQuery.mock.calls[1];
    expect(String(insert)).toContain('ON CONFLICT (task_id, thread_file_id, row_index) DO NOTHING');
  });
});

describe('where the list stands', () => {
  it('counts every item of the owner’s goal by state', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        { state: 'route_found', n: '12' },
        { state: 'no_route', n: '18' },
      ],
      rowCount: 2,
    } as never);
    await expect(listStatus('501', 10)).resolves.toEqual({ route_found: 12, no_route: 18 });
    expect(String(mockQuery.mock.calls[0][0])).toContain('t.user_id = $2::int');
  });
});

describe('the model’s tools', () => {
  const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');

  it('are offered to every run and have a door', () => {
    expect(chat).toContain('  WORK_THE_LIST_TOOL,\n  LIST_STATUS_TOOL,');
    expect(chat).toContain("case 'work_the_list': {");
    expect(chat).toContain("case 'list_status':");
  });

  it('say that working the list sends nothing, and the plan has one card', () => {
    expect(chat).toContain(
      "the owner's own contacts is looked up (in parallel) and stored with the row's state. Sends ",
    );
    expect(chat).toContain('with ONE approve card — one approval for the whole list');
  });
});
