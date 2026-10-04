jest.mock('../../db/postgres/client', () => ({ __esModule: true, query: jest.fn() }));
jest.mock('../openingSearch.service', () => ({ __esModule: true, findWaysIn: jest.fn() }));

import ExcelJS from 'exceljs';
import { readFileSync } from 'fs';
import { join } from 'path';
import { query } from '../../db/postgres/client';
import { findWaysIn } from '../openingSearch.service';
import {
  ListItemState,
  listStatus,
  listWorkbook,
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
    mockWaysIn.mockImplementationOnce(async (_user, _names, _origin, onContactPhone) => {
      onContactPhone?.('Acme', '995500000001');
      return new Map([
        ['Acme', { kind: 'first_circle' as const, who: 'ნინო' }],
        ['Beta', { kind: 'none' as const }],
      ]);
    });
    const outcome = await startListWork('501', 10, 7, { threadId: 30, runId: 'r' });
    if (!outcome.ok) throw new Error(outcome.error);
    expect(mockWaysIn).toHaveBeenCalledWith(
      '501',
      ['Acme', 'Beta'],
      { threadId: 30, runId: 'r' },
      expect.any(Function),
    );
    expect(outcome.value.total).toBe(2);
    expect(outcome.value.counts).toEqual({ route_found: 1, no_route: 1 });
    expect(outcome.value.items[0]).toEqual({
      row: 1,
      label: 'Acme',
      state: ListItemState.RouteFound,
      throughWhom: 'ნინო',
    });
    const [insert, params] = mockQuery.mock.calls[1];
    expect(String(insert)).toContain('ON CONFLICT (task_id, thread_file_id, row_index) DO NOTHING');
    // The contact's number is stored with its row, and never handed back.
    const stored = JSON.parse(String((params as unknown[])[2])) as { through_phone: unknown }[];
    expect(stored.map((r) => r.through_phone)).toEqual(['995500000001', null]);
    expect(JSON.stringify(outcome.value)).not.toContain('995500000001');
  });
});

describe('where the list stands', () => {
  it('counts the owner’s rows by state and the goal’s asks by status', async () => {
    mockQuery
      .mockResolvedValueOnce({
        rows: [
          { state: 'route_found', n: '12' },
          { state: 'no_route', n: '18' },
        ],
        rowCount: 2,
      } as never)
      .mockResolvedValueOnce({ rows: [{ state: 'sent', n: '3' }], rowCount: 1 } as never);
    await expect(listStatus('501', 10)).resolves.toEqual({
      rows: { route_found: 12, no_route: 18 },
      asks: { sent: 3 },
    });
    expect(String(mockQuery.mock.calls[0][0])).toContain('t.user_id = $2::int');
    expect(String(mockQuery.mock.calls[1][0])).toContain('a.parent_ask_id IS NULL');
  });

  it('reads a row as asked or answered from the goal’s ask to its contact, matched by number', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [], rowCount: 0 } as never)
      .mockResolvedValueOnce({ rows: [], rowCount: 0 } as never);
    await listStatus('501', 10);
    const sql = String(mockQuery.mock.calls[0][0]);
    expect(sql).toContain('up."userId" = a.to_user_id AND up.phone = li.through_phone');
    expect(sql).toContain("WHEN 'sent' THEN 'asked'");
    expect(sql).toContain("CASE ask.status WHEN 'answered' THEN 'answered'");
    expect(sql).toContain("a.status <> 'cancelled'");
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

/** Board #894: the worked list back as Excel, the owner's columns then Netai's. */
describe('the worked list as Excel', () => {
  it('carries the owner’s columns, then the way in, through whom and the state', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          row_data: ['თბილისი', 'Acme'],
          way_in: 'first_circle',
          through_whom: 'ნინო',
          state: 'answered',
          answer: 'კი, დაგაკავშირებ. ნომერი: 599 12 34 56',
          columns: ['ქალაქი', 'კომპანია'],
        },
        {
          row_data: ['ბათუმი', 'Beta'],
          way_in: 'none',
          through_whom: null,
          state: 'no_route',
          answer: null,
          columns: ['ქალაქი', 'კომპანია'],
        },
      ],
      rowCount: 2,
    } as never);
    const buffer = await listWorkbook('501', 10, 'ka');
    if (buffer === null) throw new Error('expected a workbook');
    const book = new ExcelJS.Workbook();
    await book.xlsx.load(buffer as unknown as ArrayBuffer);
    const sheet = book.worksheets[0];
    const row = (n: number): unknown[] => (sheet.getRow(n).values as unknown[]).slice(1);
    expect(row(1)).toEqual([
      'ქალაქი',
      'კომპანია',
      'Netai: გზა',
      'Netai: ვისი გავლით',
      'Netai: მდგომარეობა',
      'Netai: პასუხი',
    ]);
    expect(row(2).slice(0, 5)).toEqual([
      'თბილისი',
      'Acme',
      'შენი კონტაქტის გავლით',
      'ნინო',
      'უპასუხა',
    ]);
    // The answer is shown, a number in it is not.
    expect(String(row(2)[5])).toContain('კი, დაგაკავშირებ.');
    expect(String(row(2)[5])).not.toContain('599 12 34 56');
    expect(row(3).slice(2)).toEqual(['შენს კონტაქტებში არავინ', '', 'გზა არ არის', '']);
    expect(String(mockQuery.mock.calls[0][0])).toContain('t.user_id = $2::int');
  });

  it('is nothing when the goal has no list of this owner’s', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 } as never);
    await expect(listWorkbook('501', 10, 'ka')).resolves.toBeNull();
  });

  it('is served to the goal’s owner as an .xlsx download', () => {
    const routes = readFileSync(
      join(__dirname, '..', '..', 'api', 'routes', 'threadFiles.routes.ts'),
      'utf8',
    );
    expect(routes).toContain("'/goals/:taskId/list.xlsx',");
    expect(routes).toContain("res.setHeader('Content-Type', XLSX_TYPE);");
  });
});
