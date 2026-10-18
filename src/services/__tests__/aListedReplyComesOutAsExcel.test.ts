import { readFileSync } from 'fs';
import { join } from 'path';
import ExcelJS from 'exceljs';

jest.mock('../../db/postgres/client', () => ({ __esModule: true, query: jest.fn() }));

import { query } from '../../db/postgres/client';
import { MAX_TABLE_ROWS, tableFromMessage, tableWorkbook } from '../messageTable';
import { shownAssistantReply } from '../threads.service';

const mockQuery = query as jest.MockedFunction<typeof query>;

/**
 * 894 (b), 2347 (Lika's second phone file, 16 Oct): „give me these three names
 * as Excel" got text and no file. One reply's list or table now comes out as
 * an .xlsx.
 */
describe('what a reply lists', () => {
  it('reads a numbered list one item per row, emphasis dropped', () => {
    const reply = 'აი სია:\n\n1. **ნინო ბერიძე**\n2. გიორგი კაპანაძე\n3. ლევან ჯაში\n\nსხვა რამე?';
    expect(tableFromMessage(reply)).toEqual([['ნინო ბერიძე'], ['გიორგი კაპანაძე'], ['ლევან ჯაში']]);
  });

  it('reads a bulleted list the same way', () => {
    expect(tableFromMessage('- Ana\n* Beka\n• Dato')).toEqual([['Ana'], ['Beka'], ['Dato']]);
  });

  it('reads a Markdown table header first, cell by cell, without its separator line', () => {
    const reply = '| სახელი | კომპანია |\n|---|:--:|\n| ნინო | TBC |\n| გიორგი | BoG |';
    expect(tableFromMessage(reply)).toEqual([
      ['სახელი', 'კომპანია'],
      ['ნინო', 'TBC'],
      ['გიორგი', 'BoG'],
    ]);
  });

  it('prefers the table when a reply has both', () => {
    const reply = '1. intro\n2. more\n\n| a | b |\n|---|---|\n| 1 | 2 |';
    expect(tableFromMessage(reply)).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });

  // #5578 (the tester, 18 Oct): „name | job" was one cell, so the job could not be sorted.
  it("splits items that all share a bar into columns, under a header in the reply's script", () => {
    const reply = '1. ანა ლომიძე | იურისტი\n2. გიორგი ბერიძე | ექიმი\n3. ნინო კაპანაძე | დიზაინერი';
    expect(tableFromMessage(reply)).toEqual([
      ['სახელი', 'დეტალები'],
      ['ანა ლომიძე', 'იურისტი'],
      ['გიორგი ბერიძე', 'ექიმი'],
      ['ნინო კაპანაძე', 'დიზაინერი'],
    ]);
  });

  it('splits at the first comma or dash only, so the second column keeps its own commas', () => {
    const reply = '- ანა ლომიძე, საქმიანობა მითითებული არ არის\n- გიორგი ბერიძე, ექიმი, თბილისი';
    expect(tableFromMessage(reply)).toEqual([
      ['სახელი', 'დეტალები'],
      ['ანა ლომიძე', 'საქმიანობა მითითებული არ არის'],
      ['გიორგი ბერიძე', 'ექიმი, თბილისი'],
    ]);
    expect(tableFromMessage('- Ana — lawyer\n- Beka — doctor')).toEqual([
      ['Name', 'Details'],
      ['Ana', 'lawyer'],
      ['Beka', 'doctor'],
    ]);
  });

  it('numbers the columns past two', () => {
    expect(tableFromMessage('1. Ana | lawyer | Tbilisi\n2. Beka | doctor | Batumi')?.[0]).toEqual([
      'Name',
      'Details',
      'Details 2',
    ]);
  });

  it('keeps one column when not every item shares the separator', () => {
    expect(tableFromMessage('1. Ana | lawyer\n2. Beka')).toEqual([['Ana | lawyer'], ['Beka']]);
  });

  it('finds nothing in a reply that lists nothing, or only one line', () => {
    expect(tableFromMessage('თბილისში დღეს მზიანი ამინდია.')).toBeNull();
    expect(tableFromMessage('1. მხოლოდ ერთი')).toBeNull();
    expect(tableFromMessage('')).toBeNull();
  });

  it('keeps at most the row limit', () => {
    const long = Array.from({ length: MAX_TABLE_ROWS + 5 }, (_, i) => `${i + 1}. row`).join('\n');
    expect(tableFromMessage(long)).toHaveLength(MAX_TABLE_ROWS);
  });
});

describe('the workbook', () => {
  it('opens with every row and the Georgian text intact', async () => {
    const rows = [
      ['სახელი', 'კომპანია'],
      ['ნინო', 'TBC'],
    ];
    const book = new ExcelJS.Workbook();
    await book.xlsx.load((await tableWorkbook(rows)) as unknown as ArrayBuffer);
    const sheet = book.worksheets[0];
    expect(sheet.rowCount).toBe(2);
    expect(sheet.getRow(1).getCell(1).text).toBe('სახელი');
    expect(sheet.getRow(2).getCell(2).text).toBe('TBC');
  });
});

describe('the reply a file is made from', () => {
  beforeEach(() => mockQuery.mockReset());

  it('is only a shown answer of that same thread', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ content: '1. a\n2. b' }] } as never);
    expect(await shownAssistantReply(7, 'abc-1')).toBe('1. a\n2. b');
    const [sql, params, timeout] = mockQuery.mock.calls[0];
    expect(sql).toContain('thread_id = $1');
    expect(sql).toContain('id::text = $2');
    expect(sql).toContain("role = 'assistant'");
    expect(sql).toContain("kind = 'message'");
    expect(params).toEqual([7, 'abc-1']);
    expect(timeout).toBeGreaterThan(0);
  });

  it('is null when there is no such reply', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] } as never);
    expect(await shownAssistantReply(7, 'missing')).toBeNull();
  });
});

/**
 * The route is a closure in threadsRouter and this repository has no
 * supertest, so its guards are held by their text (the house precedent:
 * theStopDoesNotQueueBehindTheRun.test.ts).
 */
describe('GET /threads/:id/messages/:messageId/table.xlsx', () => {
  const routes = readFileSync(
    join(__dirname, '..', '..', 'api', 'routes', 'threads.routes.ts'),
    'utf8',
  );
  const at = routes.indexOf("'/:id/messages/:messageId/table.xlsx'");
  const handler = routes.slice(at, at + 1_800);

  it('exists, rate-limited and validated', () => {
    expect(at).toBeGreaterThan(-1);
    expect(handler).toContain('rateLimit(');
    expect(handler).toContain("param('id').isInt({ min: 1 })");
    expect(handler).toContain("param('messageId').matches(MESSAGE_ID_RE)");
  });

  it('reads the reply only after the thread is the caller’s own', () => {
    expect(handler).toContain('const thread = await getThread(threadId, userId);');
    expect(handler).toMatch(/thread === null \? null : await shownAssistantReply\(/u);
  });

  it('answers 404 when there is nothing to put in a file', () => {
    expect(handler).toContain('if (rows === null) {');
    expect(handler).toContain('res.status(404)');
  });
});
