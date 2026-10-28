import JSZip from 'jszip';
import { fallbackXlsxCells } from '../xlsxFallback';
import { parseListFile } from '../listFile';

/**
 * 2377 (Lika, 7 Oct): a phone-made .xlsx was called damaged. A workbook
 * ExcelJS cannot open is read straight from its zip.
 */
const NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';

async function workbook(sheetXml: string, sharedXml?: string): Promise<Buffer> {
  const zip = new JSZip();
  zip.file(
    '[Content_Types].xml',
    '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
      '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
      '</Types>',
  );
  zip.file(
    'xl/workbook.xml',
    `<x:workbook xmlns:x="${NS}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><x:sheets><x:sheet name="S" sheetId="1" r:id="rId1"/></x:sheets></x:workbook>`,
  );
  zip.file('xl/worksheets/sheet1.xml', sheetXml);
  if (sharedXml !== undefined) zip.file('xl/sharedStrings.xml', sharedXml);
  return zip.generateAsync({ type: 'nodebuffer' });
}

const PREFIXED = `<x:worksheet xmlns:x="${NS}"><x:sheetData>
<x:row r="1"><x:c r="A1" t="inlineStr"><x:is><x:t>კომპანია</x:t></x:is></x:c><x:c r="B1" t="inlineStr"><x:is><x:t>City</x:t></x:is></x:c></x:row>
<x:row r="2"><x:c r="A2" t="inlineStr"><x:is><x:t>TBC &amp; Co</x:t></x:is></x:c><x:c r="B2" t="inlineStr"><x:is><x:t>Tbilisi</x:t></x:is></x:c></x:row>
<x:row r="3"><x:c r="A3" t="inlineStr"><x:is><x:t>Alfa</x:t></x:is></x:c><x:c r="B3"><x:v>42</x:v></x:c></x:row>
</x:sheetData></x:worksheet>`;

describe('a phone-made workbook is read (2377)', () => {
  it('prefixed tags and inline strings', async () => {
    const rows = await fallbackXlsxCells(await workbook(PREFIXED), 10);
    expect(rows).toEqual([
      ['კომპანია', 'City'],
      ['TBC & Co', 'Tbilisi'],
      ['Alfa', '42'],
    ]);
  });

  it('shared strings, and cells with no address', async () => {
    const sheet = `<worksheet xmlns="${NS}"><sheetData><row><c t="s"><v>0</v></c><c t="s"><v>1</v></c></row><row><c t="s"><v>2</v></c><c><v>7</v></c></row></sheetData></worksheet>`;
    const shared = `<sst xmlns="${NS}"><si><t>Company</t></si><si><r><t>Ci</t></r><r><t>ty</t></r></si><si><t>Beta</t></si></sst>`;
    expect(await fallbackXlsxCells(await workbook(sheet, shared), 10)).toEqual([
      ['Company', 'City'],
      ['Beta', '7'],
    ]);
  });

  it('the whole upload path reads it as a table, not as damaged', async () => {
    const outcome = await parseListFile(await workbook(PREFIXED), 'list.xlsx');
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.file.columns).toEqual(['კომპანია', 'City']);
      expect(outcome.file.rows).toHaveLength(2);
    }
  });

  it('a file that is not a workbook still throws', async () => {
    await expect(fallbackXlsxCells(Buffer.from('not a zip'), 10)).rejects.toThrow();
  });
});

describe('a sheet whose rows were not all read (2377, 16 Oct)', () => {
  const row = (n: number): string =>
    `<x:row r="${n}"><x:c r="A${n}" t="inlineStr"><x:is><x:t>secret ${n}</x:t></x:is></x:c></x:row>`;

  it('logs the counts and tag names, never a cell', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const broken = `<x:worksheet xmlns:x="${NS}"><x:sheetData><x:row r="1">${row(2)}${row(3)}</x:sheetData></x:worksheet>`;
    await fallbackXlsxCells(await workbook(broken), 600);
    expect(warn).toHaveBeenCalledTimes(1);
    const line = String(warn.mock.calls[0][0]);
    expect(line).toContain('fallback read 2 of 3 row tags');
    expect(line).toContain('<x:row');
    expect(line).not.toContain('secret');
    warn.mockRestore();
  });

  it('says nothing when every row was read, or the read stopped at its limit', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const sheet = `<x:worksheet xmlns:x="${NS}"><x:sheetData>${row(1)}${row(2)}${row(3)}</x:sheetData></x:worksheet>`;
    await fallbackXlsxCells(await workbook(sheet), 600);
    await fallbackXlsxCells(await workbook(sheet), 2);
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});

/** Tester 77413 (a real member, 28 Oct): Georgian as „&#4321;", and the list on sheet 2. */
describe('a workbook whose list is not on the first sheet', () => {
  it('decodes numeric character references', async () => {
    const xml = `<worksheet xmlns="${NS}"><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>&#4321;&#4304;&#x10D2;</t></is></c></row></sheetData></worksheet>`;
    expect(await fallbackXlsxCells(await workbook(xml), 10)).toEqual([['საგ']]);
  });

  it('reads the sheet with the most rows', async () => {
    const zip = await JSZip.loadAsync(
      await workbook(
        `<worksheet xmlns="${NS}"><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>Instructions</t></is></c></row></sheetData></worksheet>`,
      ),
    );
    zip.file(
      'xl/worksheets/sheet2.xml',
      `<worksheet xmlns="${NS}"><sheetData>` +
        ['Company', 'TBC', 'Alfa']
          .map(
            (v, i) =>
              `<row r="${i + 1}"><c r="A${i + 1}" t="inlineStr"><is><t>${v}</t></is></c></row>`,
          )
          .join('') +
        `</sheetData></worksheet>`,
    );
    const rows = await fallbackXlsxCells(await zip.generateAsync({ type: 'nodebuffer' }), 10);
    expect(rows).toEqual([['Company'], ['TBC'], ['Alfa']]);
  });
});
