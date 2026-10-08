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
