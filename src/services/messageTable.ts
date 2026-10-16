import ExcelJS from 'exceljs';
import { fitsACell } from './listItems.service';

/**
 * 894 (b) and 2347, Lika's second phone file (16 Oct): „give me these three
 * names as Excel" got the names as text and no file. The only Excel that
 * could come out of Netai was a worked UPLOADED list (GET
 * /thread-files/goals/:taskId/list.xlsx); a list Netai itself wrote in a
 * reply had no way out but copying.
 *
 * This reads one reply the owner already sees and turns what it lists into
 * rows: a Markdown table cell by cell, or a numbered or bulleted list one item
 * per row. A reply with neither has no table, and nothing is made up for it.
 */
export const MAX_TABLE_ROWS = 500;
/** A list of one line is a sentence, not a list. */
const MIN_LIST_ITEMS = 2;
const SHEET_NAME = 'Netai';

const TABLE_LINE_RE = /^\s*\|(.*)\|\s*$/u;
/** `|---|:--:|` — the line under a Markdown table's header. */
const SEPARATOR_CELL_RE = /^\s*:?-+:?\s*$/u;
const LIST_ITEM_RE = /^\s*(?:\d{1,3}[.)]|[-*•])\s+(.+?)\s*$/u;
const EMPHASIS_RE = /(\*\*|__|`)/gu;

function cleanCell(cell: string): string {
  return cell.replace(EMPHASIS_RE, '').replace(/\s+/gu, ' ').trim();
}

function tableCells(line: string): string[] | null {
  const match = TABLE_LINE_RE.exec(line);
  return match === null ? null : match[1].split('|').map(cleanCell);
}

function isSeparator(cells: readonly string[]): boolean {
  return cells.length > 0 && cells.every((cell) => SEPARATOR_CELL_RE.test(cell));
}

/** The first Markdown table in the text, header first; null when there is none. */
function markdownTable(lines: readonly string[]): string[][] | null {
  const start = lines.findIndex((line) => tableCells(line) !== null);
  if (start === -1) return null;
  const rows: string[][] = [];
  for (const line of lines.slice(start)) {
    const cells = tableCells(line);
    if (cells === null) break;
    if (!isSeparator(cells)) rows.push(cells);
  }
  return rows.length >= MIN_LIST_ITEMS ? rows : null;
}

/** The numbered or bulleted items of the text, one per row; null under two. */
function listItems(lines: readonly string[]): string[][] | null {
  const items = lines
    .map((line) => LIST_ITEM_RE.exec(line))
    .filter((match): match is RegExpExecArray => match !== null)
    .map((match) => [cleanCell(match[1])]);
  return items.length >= MIN_LIST_ITEMS ? items : null;
}

/** What one reply lists, as rows of cells; null when it lists nothing. */
export function tableFromMessage(text: string): string[][] | null {
  const lines = text.split(/\r?\n/u);
  const rows = markdownTable(lines) ?? listItems(lines);
  return rows === null ? null : rows.slice(0, MAX_TABLE_ROWS);
}

/** The rows as a one-sheet workbook, every cell within Excel's limit. */
export async function tableWorkbook(rows: readonly (readonly string[])[]): Promise<Buffer> {
  const book = new ExcelJS.Workbook();
  const sheet = book.addWorksheet(SHEET_NAME);
  for (const row of rows) sheet.addRow(row.map(fitsACell));
  return Buffer.from(await book.xlsx.writeBuffer());
}
