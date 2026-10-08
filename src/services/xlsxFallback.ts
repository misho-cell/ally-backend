import JSZip from 'jszip';
import { columnNumber } from './xlsxAddresses';

/**
 * 2377 (Lika, phone, 7 Oct): a small .xlsx made on a phone was refused as
 * „damaged or password-protected". ExcelJS reads the workbooks Excel writes on
 * a computer; files from phone apps and other writers trip it in ways that
 * have nothing to do with the data — a namespace prefix on every tag
 * (`<x:row>`), the Strict OOXML namespaces, strings kept inline in the cell.
 *
 * When ExcelJS throws, this reads the FIRST worksheet straight from the zip:
 * the shared strings, then every cell's value. Text and numbers only, which is
 * all a list needs; formulas read as their stored result. A file that is not a
 * zip at all, or has no worksheet, still throws, and the caller still says so.
 */
const SHEET_PATH_RE = /^xl\/worksheets\/sheet(\d+)\.xml$/u;
const SHARED_STRINGS_PATH = 'xl/sharedStrings.xml';
/** A tag with or without a namespace prefix: `<row>`, `<x:row>`. */
const tagRe = (name: string, flags = 'gu'): RegExp =>
  new RegExp(`<(?:\\w+:)?${name}\\b([^>]*?)(?:/>|>([\\s\\S]*?)</(?:\\w+:)?${name}>)`, flags);
const ATTR_RE = (name: string): RegExp => new RegExp(`\\s${name}="([^"]*)"`, 'u');
const XML_ENTITIES: Readonly<Record<string, string>> = {
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&apos;': "'",
  '&amp;': '&',
};

function unescapeXml(text: string): string {
  return text.replace(/&(?:lt|gt|quot|apos|amp);/gu, (entity) => XML_ENTITIES[entity] ?? entity);
}

/** All the text runs inside one string item, joined: `<si><r><t>a</t></r><r><t>b</t></r></si>`. */
function textOf(xml: string): string {
  return [...xml.matchAll(tagRe('t'))].map((m) => unescapeXml(m[2] ?? '')).join('');
}

function sharedStrings(xml: string | null): string[] {
  if (xml === null) return [];
  return [...xml.matchAll(tagRe('si'))].map((m) => textOf(m[2] ?? ''));
}

function cellValue(attributes: string, inner: string, shared: readonly string[]): string {
  const type = ATTR_RE('t').exec(attributes)?.[1] ?? '';
  if (type === 'inlineStr') return textOf(inner);
  const value = unescapeXml(tagRe('v', 'u').exec(inner)?.[2] ?? '');
  if (type === 's') return shared[Number(value)] ?? '';
  return value;
}

/** The first worksheet's cells as text rows, at most `maxRows`. */
export async function fallbackXlsxCells(buffer: Buffer, maxRows: number): Promise<string[][]> {
  const zip = await JSZip.loadAsync(buffer);
  const sheetPath = Object.keys(zip.files)
    .filter((path) => SHEET_PATH_RE.test(path))
    .sort((a, b) => Number(SHEET_PATH_RE.exec(a)?.[1]) - Number(SHEET_PATH_RE.exec(b)?.[1]))[0];
  if (sheetPath === undefined) throw new Error('no worksheet in the workbook');
  const sheetXml = (await zip.file(sheetPath)?.async('string')) ?? '';
  const shared = sharedStrings((await zip.file(SHARED_STRINGS_PATH)?.async('string')) ?? null);
  const rows: string[][] = [];
  for (const row of sheetXml.matchAll(tagRe('row'))) {
    if (rows.length >= maxRows) break;
    const values: string[] = [];
    let column = 0;
    for (const cell of (row[2] ?? '').matchAll(tagRe('c'))) {
      const address = /\sr="([A-Z]+)\d+"/u.exec(cell[1] ?? '');
      column = address === null ? column + 1 : columnNumber(address[1]);
      values[column - 1] = cellValue(cell[1] ?? '', cell[2] ?? '', shared);
    }
    rows.push(Array.from(values, (v) => v ?? ''));
  }
  return rows;
}
