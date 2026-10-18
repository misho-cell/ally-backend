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

/**
 * #5578 (the tester, 18 Oct): a list of „name | job" came out as ONE column, so
 * the owner could not sort or filter by what people do. When every item carries
 * the same separator, it is split into columns: a bar on every bar, any other
 * separator once, at its first place (a job can hold a comma). A list whose
 * items do not all share one stays a single column — nothing is guessed.
 */
interface ItemSeparator {
  readonly mark: string;
  readonly everyPlace: boolean;
}
const ITEM_SEPARATORS: readonly ItemSeparator[] = [
  // #5578 retest (tester 18 Oct 07:36Z): the answer wrote „name<TAB>job".
  { mark: '\t', everyPlace: true },
  { mark: ' | ', everyPlace: true },
  { mark: ' — ', everyPlace: false },
  { mark: ' – ', everyPlace: false },
  { mark: ' - ', everyPlace: false },
  { mark: ': ', everyPlace: false },
  { mark: ', ', everyPlace: false },
];
const GEORGIAN_LETTER_RE = /[\u10D0-\u10FF]/u;
/** The header of a split list, in the reply's own script; the columns past two are numbered. */
const SPLIT_HEADER = {
  ka: { first: 'სახელი', rest: 'დეტალები' },
  en: { first: 'Name', rest: 'Details' },
} as const;

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

/** An item as written, emphasis dropped and spaces evened, its tabs kept for the split. */
function rawItem(item: string): string {
  return item
    .replace(EMPHASIS_RE, '')
    .replace(/[^\S\t]+/gu, ' ')
    .trim();
}

function splitItem(item: string, separator: ItemSeparator): string[] {
  if (separator.everyPlace) {
    const mark = separator.mark.trim() === '' ? separator.mark : separator.mark.trim();
    return item.split(mark).map(cleanCell);
  }
  const at = item.indexOf(separator.mark);
  return [item.slice(0, at), item.slice(at + separator.mark.length)].map(cleanCell);
}

/** The one separator every item carries with something on both sides, if any. */
function sharedSeparator(items: readonly string[]): ItemSeparator | null {
  return (
    ITEM_SEPARATORS.find((separator) =>
      items.every(
        (item) =>
          item.includes(separator.mark) &&
          splitItem(item, separator).every((part) => part.length > 0),
      ),
    ) ?? null
  );
}

function splitHeader(columns: number, text: string): string[] {
  const words = GEORGIAN_LETTER_RE.test(text) ? SPLIT_HEADER.ka : SPLIT_HEADER.en;
  return Array.from({ length: columns }, (_, i) =>
    i === 0 ? words.first : i === 1 ? words.rest : `${words.rest} ${i}`,
  );
}

/** The answer's own first row is a header when it opens with the header's first word. */
function opensWithAHeader(row: readonly string[]): boolean {
  const first = (row[0] ?? '').toLowerCase();
  return first === SPLIT_HEADER.ka.first || first === SPLIT_HEADER.en.first.toLowerCase();
}

/** Items that share a separator as columns under a header; otherwise one item per row. */
function itemRows(items: readonly string[]): string[][] {
  const separator = sharedSeparator(items);
  if (separator === null) return items.map((item) => [cleanCell(item)]);
  const rows = items.map((item) => splitItem(item, separator));
  if (opensWithAHeader(rows[0])) return rows;
  const columns = Math.max(...rows.map((row) => row.length));
  return [splitHeader(columns, items.join(' ')), ...rows];
}

/** The numbered or bulleted items of the text, one per row; null under two. */
function listItems(lines: readonly string[]): string[][] | null {
  const items = lines
    .map((line) => LIST_ITEM_RE.exec(line))
    .filter((match): match is RegExpExecArray => match !== null)
    .map((match) => rawItem(match[1]));
  return items.length >= MIN_LIST_ITEMS ? itemRows(items) : null;
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
