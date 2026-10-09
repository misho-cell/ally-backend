import ExcelJS from 'exceljs';
import { RunLanguage } from './runLanguage';
import { withCellAddresses } from './xlsxAddresses';
import { fallbackXlsxCells } from './xlsxFallback';

/**
 * Board #892 (the founder, 4 October): „if someone needs to connect with 30
 * companies and is uploading a list, we need that function". Part 1 — the
 * file is read. This module only READS: it turns the bytes into columns, rows
 * and plain text, bounded, and says in one line what it understood. Nothing
 * here stores, sends or acts; and the text it returns is the owner's DATA,
 * never an instruction (#895) — the caller hands it to the model as such.
 */
export const MAX_FILE_BYTES = 2 * 1024 * 1024;
export const MAX_ROWS = 500;
export const MAX_TEXT_CHARS = 50_000;
const MAX_CELL_CHARS = 300;
/** The header, the rows kept, and one more — so a cut can be seen and said. */
const ROWS_TO_READ = MAX_ROWS + 2;
/** A UTF-8 byte-order mark some spreadsheet exports put before the first cell. */
const BYTE_ORDER_MARK_RE = new RegExp('^\\uFEFF', 'u');
/** What ExcelJS throws for a sheet whose rows or cells carry no address. */
const MISSING_ADDRESS_RE = /Invalid (row|column) number/u;

export enum ListFileKind {
  Csv = 'csv',
  Xlsx = 'xlsx',
  Text = 'text',
}

export enum ListFileRefusal {
  TooLarge = 'too_large',
  Unsupported = 'unsupported',
  Empty = 'empty',
  Unreadable = 'unreadable',
}

export interface ParsedListFile {
  readonly kind: ListFileKind;
  /** The first row of a table, read as its column names; empty for plain text. */
  readonly columns: readonly string[];
  /** The table's rows after the header, each cell as text; empty for plain text. */
  readonly rows: readonly (readonly string[])[];
  /** Whether rows past MAX_ROWS were left out. */
  readonly rowsCut: boolean;
  /** The whole content as plain text, capped at MAX_TEXT_CHARS. */
  readonly text: string;
}

export type ListFileOutcome =
  | { readonly ok: true; readonly file: ParsedListFile }
  | { readonly ok: false; readonly reason: ListFileRefusal };

const EXTENSION_KINDS: Readonly<Record<string, ListFileKind>> = {
  csv: ListFileKind.Csv,
  xlsx: ListFileKind.Xlsx,
  txt: ListFileKind.Text,
  md: ListFileKind.Text,
  markdown: ListFileKind.Text,
};

/** What kind of file this is, by its extension; null for anything slice 1 does not read. */
export function listFileKind(filename: string): ListFileKind | null {
  const dot = filename.lastIndexOf('.');
  if (dot === -1) return null;
  return EXTENSION_KINDS[filename.slice(dot + 1).toLowerCase()] ?? null;
}

/**
 * T3631: a picture renamed .csv reached the database as text with NUL bytes
 * in it, Postgres refused the row and the owner got a 500. A text file has no
 * NUL byte, and decodes with few replacement characters; anything else is
 * binary and is refused in one plain line (400), like a broken workbook.
 */
const BINARY_SAMPLE_BYTES = 8_192;
const MAX_REPLACEMENT_SHARE = 0.1;
const REPLACEMENT_CHAR_RE = /\uFFFD/gu;

export function isBinary(buffer: Buffer): boolean {
  const sample = buffer.subarray(0, BINARY_SAMPLE_BYTES);
  if (sample.includes(0)) return true;
  const text = sample.toString('utf8');
  if (text.length === 0) return false;
  const replaced = text.match(REPLACEMENT_CHAR_RE)?.length ?? 0;
  return replaced / text.length > MAX_REPLACEMENT_SHARE;
}

export async function parseListFile(buffer: Buffer, filename: string): Promise<ListFileOutcome> {
  if (buffer.length > MAX_FILE_BYTES) return { ok: false, reason: ListFileRefusal.TooLarge };
  const kind = listFileKind(filename);
  if (kind === null) return { ok: false, reason: ListFileRefusal.Unsupported };
  if (kind !== ListFileKind.Xlsx && isBinary(buffer)) {
    // eslint-disable-next-line no-console
    console.warn(`[list-file] ${kind} is binary (${buffer.length} bytes) — not read`);
    return { ok: false, reason: ListFileRefusal.Unreadable };
  }
  try {
    const table =
      kind === ListFileKind.Xlsx
        ? await xlsxCells(buffer)
        : kind === ListFileKind.Csv
          ? csvCells(buffer.toString('utf8'))
          : null;
    const file = table === null ? textFile(buffer.toString('utf8')) : tableFile(kind, table);
    if (file.text.trim() === '') return { ok: false, reason: ListFileRefusal.Empty };
    return { ok: true, file };
  } catch (err) {
    // A broken or encrypted workbook: said in one plain line by the caller.
    // T2411: the reason is logged (never the content), so a refusal can be read.
    // eslint-disable-next-line no-console
    console.warn(`[list-file] ${kind} not read (${buffer.length} bytes):`, (err as Error).message);
    return { ok: false, reason: ListFileRefusal.Unreadable };
  }
}

function textFile(raw: string): ParsedListFile {
  return {
    kind: ListFileKind.Text,
    columns: [],
    rows: [],
    rowsCut: false,
    text: raw.replace(BYTE_ORDER_MARK_RE, '').slice(0, MAX_TEXT_CHARS),
  };
}

function tableFile(kind: ListFileKind, cells: string[][]): ParsedListFile {
  const filled = cells.filter((row) => row.some((cell) => cell !== ''));
  const [header = [], ...body] = filled;
  const rows = body.slice(0, MAX_ROWS);
  const text = [header, ...rows]
    .map((row) => row.join(' | '))
    .join('\n')
    .slice(0, MAX_TEXT_CHARS);
  return { kind, columns: header, rows, rowsCut: body.length > MAX_ROWS, text };
}

function cellText(value: unknown): string {
  return String(value ?? '')
    .replace(/\s+/gu, ' ')
    .trim()
    .slice(0, MAX_CELL_CHARS);
}

async function loadedWorkbook(buffer: Buffer): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
  return workbook;
}

/** The workbook; one written without row and cell addresses is addressed first (43066). */
async function readWorkbook(buffer: Buffer): Promise<ExcelJS.Workbook> {
  try {
    return await loadedWorkbook(buffer);
  } catch (error) {
    if (!(error instanceof Error) || !MISSING_ADDRESS_RE.test(error.message)) throw error;
    return loadedWorkbook(await withCellAddresses(buffer));
  }
}

/**
 * The first worksheet as text cells; formulas read as their results. 2377: a
 * workbook ExcelJS cannot open is read straight from its zip before it is
 * called unreadable.
 */
async function xlsxCells(buffer: Buffer): Promise<string[][]> {
  try {
    return await excelJsCells(buffer);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(
      '[list-file] ExcelJS refused the workbook, reading it directly:',
      (err as Error).message,
    );
    const rows = await fallbackXlsxCells(buffer, ROWS_TO_READ);
    return rows.map((row) => row.map(cellText));
  }
}

async function excelJsCells(buffer: Buffer): Promise<string[][]> {
  const workbook = await readWorkbook(buffer);
  const sheet = workbook.worksheets[0];
  if (sheet === undefined) return [];
  const out: string[][] = [];
  sheet.eachRow({ includeEmpty: false }, (row) => {
    if (out.length >= ROWS_TO_READ) return;
    const values: string[] = [];
    row.eachCell({ includeEmpty: true }, (cell, column) => {
      values[column - 1] = cellText(cell.text);
    });
    out.push(Array.from(values, (v) => v ?? ''));
  });
  return out;
}

const CSV_DELIMITERS: readonly string[] = [',', ';', '\t'];

/** The delimiter that splits the first line into the most fields. */
function csvDelimiter(firstLine: string): string {
  return CSV_DELIMITERS.reduce((best, d) =>
    firstLine.split(d).length > firstLine.split(best).length ? d : best,
  );
}

/** RFC 4180 fields: quotes may hold delimiters, line breaks and doubled quotes. */
export function csvCells(raw: string): string[][] {
  const textBody = raw.replace(BYTE_ORDER_MARK_RE, '');
  const delimiter = csvDelimiter(textBody.split(/\r?\n/u, 1)[0] ?? '');
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < textBody.length && rows.length < ROWS_TO_READ; i += 1) {
    const ch = textBody[i];
    if (quoted) {
      if (ch === '"' && textBody[i + 1] === '"') {
        field += '"';
        i += 1;
      } else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === delimiter) {
      row.push(cellText(field));
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && textBody[i + 1] === '\n') i += 1;
      rows.push([...row, cellText(field)]);
      row = [];
      field = '';
    } else field += ch;
  }
  if (field !== '' || row.length > 0) rows.push([...row, cellText(field)]);
  return rows;
}

const MAX_COLUMNS_NAMED = 6;

const SUMMARY: Readonly<
  Record<
    RunLanguage,
    { table: (rows: number, cols: string) => string; text: (chars: number) => string; cut: string }
  >
> = {
  ka: {
    table: (rows, cols) => `ფაილი წავიკითხე: ${rows} რიგი, სვეტები: ${cols}.`,
    text: (chars) => `ფაილი წავიკითხე: ტექსტი, ${chars} სიმბოლო.`,
    cut: ` პირველ ${MAX_ROWS} რიგს ვიღებ, დანარჩენი ამჯერად გარეთ რჩება.`,
  },
  en: {
    table: (rows, cols) => `I read the file: ${rows} rows, columns: ${cols}.`,
    text: (chars) => `I read the file: text, ${chars} characters.`,
    cut: ` I take the first ${MAX_ROWS} rows; the rest stays out for now.`,
  },
  ru: {
    table: (rows, cols) => `Файл прочитан: ${rows} строк, столбцы: ${cols}.`,
    text: (chars) => `Файл прочитан: текст, ${chars} символов.`,
    cut: ` Беру первые ${MAX_ROWS} строк, остальное пока не беру.`,
  },
  es: {
    table: (rows, cols) => `Leí el archivo: ${rows} filas, columnas: ${cols}.`,
    text: (chars) => `Leí el archivo: texto, ${chars} caracteres.`,
    cut: ` Tomo las primeras ${MAX_ROWS} filas; el resto queda fuera por ahora.`,
  },
};

/** The one line Netai answers with: what it understood (#892). */
export function listFileSummary(file: ParsedListFile, language: RunLanguage): string {
  const words = SUMMARY[language] ?? SUMMARY.ka;
  if (file.kind === ListFileKind.Text) return words.text(file.text.length);
  const named = file.columns
    .filter((c) => c !== '')
    .slice(0, MAX_COLUMNS_NAMED)
    .join(', ');
  return words.table(file.rows.length, named) + (file.rowsCut ? words.cut : '');
}

const REFUSAL: Readonly<Record<RunLanguage, Readonly<Record<ListFileRefusal, string>>>> = {
  ka: {
    [ListFileRefusal.TooLarge]: 'ფაილი 2 MB-ზე დიდია — უფრო პატარა ან ნაწილებად გამომიგზავნე.',
    [ListFileRefusal.Unsupported]:
      'ამ ფორმატს ჯერ ვერ ვკითხულობ — Excel (.xlsx), CSV, TXT ან Markdown გამომიგზავნე.',
    [ListFileRefusal.Empty]: 'ფაილი ცარიელია — მასში წასაკითხი არაფერი იპოვა.',
    [ListFileRefusal.Unreadable]: 'ფაილი ვერ გავხსენი — შეიძლება დაზიანებული ან პაროლით დაცულია.',
  },
  en: {
    [ListFileRefusal.TooLarge]: 'The file is over 2 MB — send a smaller one, or in parts.',
    [ListFileRefusal.Unsupported]:
      'I cannot read this format yet — send Excel (.xlsx), CSV, TXT or Markdown.',
    [ListFileRefusal.Empty]: 'The file is empty — there was nothing in it to read.',
    [ListFileRefusal.Unreadable]:
      'I could not open the file — it may be damaged or password-protected.',
  },
  ru: {
    [ListFileRefusal.TooLarge]: 'Файл больше 2 МБ — пришли поменьше или частями.',
    [ListFileRefusal.Unsupported]:
      'Этот формат я пока не читаю — пришли Excel (.xlsx), CSV, TXT или Markdown.',
    [ListFileRefusal.Empty]: 'Файл пустой — в нём нечего читать.',
    [ListFileRefusal.Unreadable]:
      'Не смог открыть файл — возможно, он повреждён или защищён паролем.',
  },
  es: {
    [ListFileRefusal.TooLarge]: 'El archivo pasa de 2 MB — envía uno más pequeño o por partes.',
    [ListFileRefusal.Unsupported]:
      'Aún no leo este formato — envía Excel (.xlsx), CSV, TXT o Markdown.',
    [ListFileRefusal.Empty]: 'El archivo está vacío — no había nada que leer.',
    [ListFileRefusal.Unreadable]:
      'No pude abrir el archivo — puede estar dañado o protegido con contraseña.',
  },
};

/** The one plain sentence an unreadable file gets (#892). */
export function listFileRefusal(reason: ListFileRefusal, language: RunLanguage): string {
  return (REFUSAL[language] ?? REFUSAL.ka)[reason];
}
