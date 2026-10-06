/**
 * RFC 4180 CSV for the export: every field quoted when it holds a comma, a
 * quote or a line break; a leading formula character is neutralised so a
 * label like „=HYPERLINK(…)" opens as text in a spreadsheet, never as a formula.
 */
export type CsvValue = string | number | boolean | null | undefined;

const FORMULA_START = /^[=+\-@\t\r]/;

function cell(value: CsvValue): string {
  if (value === null || value === undefined) return '';
  let text = typeof value === 'string' ? value : String(value);
  if (typeof value === 'string' && FORMULA_START.test(text)) text = `'${text}`;
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** A header line and one line per row, in the header's column order. */
export function toCsv(
  columns: readonly string[],
  rows: readonly Record<string, CsvValue>[],
): string {
  const lines = [columns.map(cell).join(',')];
  for (const row of rows) lines.push(columns.map((c) => cell(row[c])).join(','));
  return `${lines.join('\r\n')}\r\n`;
}
