import ExcelJS from 'exceljs';
import {
  csvCells,
  listFileKind,
  ListFileKind,
  ListFileRefusal,
  listFileRefusal,
  listFileSummary,
  MAX_FILE_BYTES,
  MAX_ROWS,
  parseListFile,
} from '../listFile';

/**
 * Board #892 (the founder, 4 October): a list of companies in Excel, given to
 * Netai. Part 1 — the file is read, bounded, and summed up in one line.
 */
async function workbook(rows: readonly (readonly string[])[]): Promise<Buffer> {
  const book = new ExcelJS.Workbook();
  const sheet = book.addWorksheet('List');
  rows.forEach((row) => sheet.addRow([...row]));
  return Buffer.from(await book.xlsx.writeBuffer());
}

describe('which files are read', () => {
  it('knows the slice-1 formats by extension, in any case', () => {
    expect(listFileKind('companies.XLSX')).toBe(ListFileKind.Xlsx);
    expect(listFileKind('list.csv')).toBe(ListFileKind.Csv);
    expect(listFileKind('notes.md')).toBe(ListFileKind.Text);
    expect(listFileKind('notes.txt')).toBe(ListFileKind.Text);
  });

  it('refuses what it does not read yet, and anything too large', async () => {
    expect(listFileKind('scan.pdf')).toBeNull();
    await expect(parseListFile(Buffer.from('x'), 'scan.pdf')).resolves.toEqual({
      ok: false,
      reason: ListFileRefusal.Unsupported,
    });
    await expect(parseListFile(Buffer.alloc(MAX_FILE_BYTES + 1), 'big.csv')).resolves.toEqual({
      ok: false,
      reason: ListFileRefusal.TooLarge,
    });
  });

  it('says a broken workbook is unreadable rather than throwing', async () => {
    await expect(parseListFile(Buffer.from('not a zip'), 'broken.xlsx')).resolves.toEqual({
      ok: false,
      reason: ListFileRefusal.Unreadable,
    });
  });

  it('logs why a workbook was not read, without its content (T2411)', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    await parseListFile(Buffer.from('secret row text'), 'broken.xlsx');
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('[list-file] xlsx not read'),
      expect.any(String),
    );
    expect(JSON.stringify(warn.mock.calls)).not.toContain('secret row text');
    warn.mockRestore();
  });
});

describe('an Excel list', () => {
  it('becomes columns and rows, empty rows dropped', async () => {
    const buffer = await workbook([
      ['კომპანია', 'ქალაქი', 'საიტი'],
      ['Acme', 'თბილისი', 'acme.ge'],
      ['', '', ''],
      ['Beta LLC', 'ბათუმი', ''],
    ]);
    const outcome = await parseListFile(buffer, 'list.xlsx');
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.file.columns).toEqual(['კომპანია', 'ქალაქი', 'საიტი']);
    expect(outcome.file.rows).toEqual([
      ['Acme', 'თბილისი', 'acme.ge'],
      ['Beta LLC', 'ბათუმი', ''],
    ]);
    expect(listFileSummary(outcome.file, 'ka')).toBe(
      'ფაილი წავიკითხე: 2 რიგი, სვეტები: კომპანია, ქალაქი, საიტი.',
    );
  });
});

describe('a CSV list', () => {
  it('keeps a delimiter, a line break and a quote inside quotes', () => {
    expect(csvCells('name,note\n"Acme, Ltd","line one\nline two"\n"say ""hi""",x\n')).toEqual([
      ['name', 'note'],
      ['Acme, Ltd', 'line one line two'],
      ['say "hi"', 'x'],
    ]);
  });

  it('reads a semicolon export and a byte-order mark', () => {
    expect(csvCells('﻿name;city\r\nAcme;Tbilisi\r\n')).toEqual([
      ['name', 'city'],
      ['Acme', 'Tbilisi'],
    ]);
  });

  it('takes the first rows and says the rest stayed out', async () => {
    const lines = ['name', ...Array.from({ length: MAX_ROWS + 5 }, (_, i) => `Firm ${i}`)];
    const outcome = await parseListFile(Buffer.from(lines.join('\n')), 'many.csv');
    if (!outcome.ok) throw new Error('expected a parsed file');
    expect(outcome.file.rows).toHaveLength(MAX_ROWS);
    expect(outcome.file.rowsCut).toBe(true);
    expect(listFileSummary(outcome.file, 'en')).toContain('the rest stays out for now');
  });
});

describe('a text file', () => {
  it('is read as text, and an empty one is refused', async () => {
    const outcome = await parseListFile(Buffer.from('# Firms\nAcme\n'), 'notes.md');
    if (!outcome.ok) throw new Error('expected a parsed file');
    expect(outcome.file.kind).toBe(ListFileKind.Text);
    expect(outcome.file.text).toContain('Acme');
    await expect(parseListFile(Buffer.from('   \n'), 'empty.txt')).resolves.toEqual({
      ok: false,
      reason: ListFileRefusal.Empty,
    });
  });

  it('gets one plain sentence when it cannot be read', () => {
    expect(listFileRefusal(ListFileRefusal.Unsupported, 'ka')).toContain('Excel (.xlsx), CSV');
  });
});
