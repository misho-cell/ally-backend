jest.mock('../../db/postgres/client', () => ({ __esModule: true, query: jest.fn() }));
jest.mock('../openingSearch.service', () => ({ __esModule: true, findWaysIn: jest.fn() }));
jest.mock('../tools/searchByTag', () => ({ __esModule: true, ownMatchesFor: jest.fn() }));

import ExcelJS from 'exceljs';
import { ownMatchesFor } from '../tools/searchByTag';
import { readFileSync } from 'fs';
import { join } from 'path';
import { query } from '../../db/postgres/client';
import { findWaysIn } from '../openingSearch.service';
import {
  ListItemState,
  listStatus,
  listWorkbook,
  nameColumn,
  portionsOf,
  startListWork,
  stateOf,
  withEveryoneWhoFits,
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
  (ownMatchesFor as jest.MockedFunction<typeof ownMatchesFor>).mockReset().mockResolvedValue([]);
});

describe('the column a row is called by', () => {
  it('is the one whose header names it', () => {
    expect(nameColumn(['ქალაქი', 'კომპანია', 'საიტი'])).toBe(1);
    expect(nameColumn(['City', 'Company name'])).toBe(1);
  });

  it('is the first one when no header names it', () => {
    expect(nameColumn(['A', 'B'])).toBe(0);
  });

  /** 3897 (box 48679): „N | need | city" was looked up as „1", „2", „3". */
  it('is never a counting column', () => {
    expect(nameColumn(['N', 'need', 'city'])).toBe(1);
    expect(nameColumn(['#', 'საჭიროება'])).toBe(1);
    expect(
      nameColumn(
        ['row', 'need'],
        [
          ['1', 'ბუღალტერი'],
          ['2', 'იურისტი'],
        ],
      ),
    ).toBe(1);
  });

  /** Box 50656 (needs12.csv): „სახელი | პროფესია" with 1–12 under „სახელი". */
  it('is never a counting column, even under a header that says „name"', () => {
    const rows = [
      ['1', 'ელექტრიკოსი'],
      ['2', 'სანტექნიკოსი'],
      ['3', 'ნოტარიუსი'],
    ];
    expect(nameColumn(['სახელი', 'პროფესია'], rows)).toBe(1);
    expect(
      nameColumn(
        ['სახელი', 'პროფესია'],
        [
          ['ნინო', 'ექიმი'],
          ['გია', 'იურისტი'],
        ],
      ),
    ).toBe(0);
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
    // tasks.user_id is TEXT on production: compared as an int, every call threw.
    expect(String(sql)).toContain('t.user_id = $3::text');
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
    expect(outcome.value.portions).toEqual({ today: 1, later: 0 });
    expect(outcome.value.items[0]).toEqual({
      row: 1,
      label: 'Acme',
      state: ListItemState.RouteFound,
      throughWhom: 'ნინო',
    });
    const [insert, params] = mockQuery.mock.calls[1];
    // 3897: a row only looked up is looked up again; a row somebody was asked about keeps its state.
    expect(String(insert)).toContain('ON CONFLICT (task_id, thread_file_id, row_index) DO UPDATE');
    expect(String(insert)).toContain('WHERE list_items.state = ANY($4::text[])');
    expect((params as unknown[])[3]).toEqual([
      ListItemState.RouteFound,
      ListItemState.NoRoute,
      ListItemState.Unchecked,
    ]);
    // The contact's number is stored with its row, and never handed back.
    const stored = JSON.parse(String((params as unknown[])[2])) as { through_phone: unknown }[];
    expect(stored.map((r) => r.through_phone)).toEqual(['995500000001', null]);
    expect(JSON.stringify(outcome.value)).not.toContain('995500000001');
  });
});

/** Board #893: „the plan says how many today and how many later". */
/** 4325 (tester box 51106): the chat named one electrician of the owner's three. */
describe('a found row as the run reads it', () => {
  const found = {
    row: 1,
    label: 'ელექტრიკოსი',
    state: ListItemState.RouteFound,
    throughWhom: 'ვახო ელექტრიკოსი',
  };

  it('names every contact who fits it', () => {
    const fitting = new Map([
      ['ელექტრიკოსი', 'ვახო ელექტრიკოსი, ტარიელ ელექტრიკოსი, ბესო ელექტრიკოსი'],
    ]);
    expect(withEveryoneWhoFits([found], fitting)[0].everyoneWhoFits).toBe(
      'ვახო ელექტრიკოსი, ტარიელ ელექტრიკოსი, ბესო ელექტრიკოსი',
    );
  });

  it('adds nothing when only its way in fits, or the row has no way in', () => {
    const fitting = new Map([['ელექტრიკოსი', 'ვახო ელექტრიკოსი']]);
    expect(withEveryoneWhoFits([found], fitting)[0]).toEqual(found);
    const none = { ...found, state: ListItemState.NoRoute, throughWhom: null };
    expect(withEveryoneWhoFits([none], new Map([['ელექტრიკოსი', 'ვახო']]))[0]).toEqual(none);
  });
});

describe('the portions a list is written to in', () => {
  const routed = (row: number, who: string | null) => ({
    row,
    label: `Row ${row}`,
    state: who === null ? ListItemState.NoRoute : ListItemState.RouteFound,
    throughWhom: who,
  });

  it('are day one’s first three people today and the rest later, counted by person', () => {
    const items = [
      routed(1, 'ნინო'),
      routed(2, 'ნინო'),
      routed(3, 'გია'),
      routed(4, 'ლია'),
      routed(5, 'დათო'),
      routed(6, null),
    ];
    expect(portionsOf(items)).toEqual({ today: 3, later: 1 });
  });

  it('are nothing today when no row has a route', () => {
    expect(portionsOf([routed(1, null)])).toEqual({ today: 0, later: 0 });
  });

  it('are what the tool tells the plan to say', () => {
    const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
    expect(chat).toContain('from portions — how many people are written to today');
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
    expect(String(mockQuery.mock.calls[0][0])).toContain('t.user_id = $2::text');
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
    // The tester's file test (37657): the planted fifth row was left unmentioned.
    expect(chat).toContain(
      "'how many later. Account for EVERY row in that same reply: a row that is not an entry (not the ' +",
    );
    expect(chat).toContain(
      "'not used. WHEN: the owner asks to work on, reach or find a way into the ' +",
    );
  });
});

/** Board #894: the worked list back as Excel, the owner's columns then Netai's. */
describe('the worked list as Excel', () => {
  it('carries the owner’s columns, then the way in, through whom and the state', async () => {
    mockQuery.mockResolvedValue({ rows: [], rowCount: 0 } as never);
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
    expect(String(mockQuery.mock.calls[0][0])).toContain('t.user_id = $2::text');
  });

  it('says who among the owner’s contacts fits each row’s need (4160)', async () => {
    const mockMatches = ownMatchesFor as jest.MockedFunction<typeof ownMatchesFor>;
    mockMatches.mockImplementation(async (_user: string, need: string) =>
      need === 'ბუღალტერი' ? [{ phone: 'p1', name: 'ლევან ბუღალტერი' }] : [],
    );
    const row = (name: string, need: string): Record<string, unknown> => ({
      row_data: [name, need],
      way_in: 'none',
      through_whom: null,
      state: 'no_route',
      answer: null,
      columns: ['name', 'need'],
    });
    mockQuery.mockResolvedValueOnce({
      rows: [row('დავით', 'ბუღალტერი'), row('ნატო', 'ექიმი'), row('გიორგი', 'ბუღალტერი')],
      rowCount: 3,
    } as never);
    const buffer = await listWorkbook('501', 10, 'ka');
    if (buffer === null) throw new Error('expected a workbook');
    const book = new ExcelJS.Workbook();
    await book.xlsx.load(buffer as unknown as ArrayBuffer);
    const values = (n: number): unknown[] =>
      (book.worksheets[0].getRow(n).values as unknown[]).slice(1);
    expect(values(1)[6]).toBe('Netai: საჭიროებაში დაგეხმარება');
    expect(values(2)[6]).toBe('ლევან ბუღალტერი');
    expect(values(3)[6] ?? '').toBe('');
    expect(values(4)[6]).toBe('ლევან ბუღალტერი');
    // One lookup per distinct need, not per row.
    expect(mockMatches).toHaveBeenCalledTimes(2);
  });

  /** Box 50986 (goal 24125): a list whose rows are the needs, worked by asking a helper. */
  it('names every fitting contact on a found row, and points a named row at the helper’s answer', async () => {
    const mockMatches = ownMatchesFor as jest.MockedFunction<typeof ownMatchesFor>;
    mockMatches.mockImplementation(async (_user: string, need: string) =>
      need === 'ელექტრიკოსი'
        ? [
            { phone: 'p1', name: 'ნოდარ ელექტრიკოსი' },
            { phone: 'p2', name: 'კახა ელექტრიკოსი' },
            { phone: 'p3', name: 'შოთა ელექტრიკოსი' },
          ]
        : [],
    );
    const row = (label: string, wayIn: string, through: string | null, answer: string | null) => ({
      label,
      row_data: [label === 'ელექტრიკოსი' ? '1' : '2', label],
      way_in: wayIn,
      through_whom: through,
      state: wayIn === 'none' ? 'no_route' : 'answered',
      answer,
      columns: ['სახელი', 'პროფესია'],
    });
    const helperSaid = 'ნოტარიუსს და ფოტოგრაფს ვიცნობ, ნომრებს გამოგიგზავნი.';
    mockQuery
      .mockResolvedValueOnce({
        rows: [
          row('ელექტრიკოსი', 'first_circle', 'ნოდარ ელექტრიკოსი', helperSaid),
          row('ნოტარიუსი', 'none', null, null),
          row('მზარეული', 'none', null, null),
        ],
      } as never)
      .mockResolvedValueOnce({
        rows: [{ helper: 'ნოდარ ელექტრიკოსი', answer: helperSaid }],
      } as never);
    const buffer = await listWorkbook('501', 10, 'ka');
    if (buffer === null) throw new Error('expected a workbook');
    const book = new ExcelJS.Workbook();
    await book.xlsx.load(buffer as unknown as ArrayBuffer);
    const values = (n: number): unknown[] =>
      (book.worksheets[0].getRow(n).values as unknown[]).slice(1);
    expect(values(2)[3]).toBe('ნოდარ ელექტრიკოსი, კახა ელექტრიკოსი, შოთა ელექტრიკოსი');
    // 4324 (box 51106): the helper is one of the electricians, and his answer is about other rows.
    expect(values(2)[4]).toBe('გზა ნაპოვნია');
    expect(values(2)[5] ?? '').toBe('');
    expect(values(3).slice(2)).toEqual([
      'იხ. დამხმარე',
      'ნოდარ ელექტრიკოსი',
      'იხ. დამხმარე',
      helperSaid,
    ]);
    expect(values(4).slice(2)).toEqual(['შენს კონტაქტებში არავინ', '', 'გზა არ არის', '']);
  });

  it('keeps an answer on a found row when it speaks of that row', async () => {
    const said = 'ელექტრიკოსს ხვალ გამოგიგზავნი.';
    mockQuery
      .mockResolvedValueOnce({
        rows: [
          {
            label: 'ელექტრიკოსი',
            row_data: ['1', 'ელექტრიკოსი'],
            way_in: 'first_circle',
            through_whom: 'ნოდარ ელექტრიკოსი',
            state: 'answered',
            answer: said,
            columns: ['სახელი', 'პროფესია'],
          },
        ],
      } as never)
      .mockResolvedValueOnce({ rows: [] } as never);
    const buffer = await listWorkbook('501', 10, 'ka');
    if (buffer === null) throw new Error('expected a workbook');
    const book = new ExcelJS.Workbook();
    await book.xlsx.load(buffer as unknown as ArrayBuffer);
    const values = (book.worksheets[0].getRow(2).values as unknown[]).slice(1);
    expect(values.slice(4)).toEqual(['უპასუხა', said]);
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
