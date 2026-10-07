import JSZip from 'jszip';
import { ListFileRefusal, parseListFile } from '../listFile';
import { addressSheetXml, columnLetters, columnNumber } from '../xlsxAddresses';

/**
 * The tester's note of 6 Oct (box 43066): a valid small .xlsx, written with
 * inline strings, no styles part and no row or cell addresses, was refused as
 * „damaged or password protected". It is read now.
 */
const XML_HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
const MAIN_NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const PACKAGE_RELS_NS = 'http://schemas.openxmlformats.org/package/2006/relationships';
const DOC_RELS_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';

function inlineCell(text: string): string {
  return `<c t="inlineStr"><is><t>${text}</t></is></c>`;
}

/** A minimal workbook: inline strings, no styles, no shared strings, no addresses. */
async function minimalWorkbook(rows: readonly (readonly string[])[]): Promise<Buffer> {
  const sheetData = rows.map((row) => `<row>${row.map(inlineCell).join('')}</row>`).join('');
  const zip = new JSZip();
  zip.file(
    '[Content_Types].xml',
    `${XML_HEAD}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
      '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
      '</Types>',
  );
  zip.file(
    '_rels/.rels',
    `${XML_HEAD}<Relationships xmlns="${PACKAGE_RELS_NS}"><Relationship Id="rId1" Type="${DOC_RELS_NS}/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
  );
  zip.file(
    'xl/workbook.xml',
    `${XML_HEAD}<workbook xmlns="${MAIN_NS}" xmlns:r="${DOC_RELS_NS}"><sheets><sheet name="List" sheetId="1" r:id="rId1"/></sheets></workbook>`,
  );
  zip.file(
    'xl/_rels/workbook.xml.rels',
    `${XML_HEAD}<Relationships xmlns="${PACKAGE_RELS_NS}"><Relationship Id="rId1" Type="${DOC_RELS_NS}/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`,
  );
  zip.file(
    'xl/worksheets/sheet1.xml',
    `${XML_HEAD}<worksheet xmlns="${MAIN_NS}"><sheetData>${sheetData}</sheetData></worksheet>`,
  );
  return zip.generateAsync({ type: 'nodebuffer' });
}

describe('a workbook written without row and cell addresses', () => {
  it('is read as columns and rows, not refused as damaged', async () => {
    const buffer = await minimalWorkbook([
      ['company', 'city'],
      ['Acme', 'Tbilisi'],
      ['Beta', 'Batumi'],
    ]);
    const outcome = await parseListFile(buffer, 'list.xlsx');
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.file.columns).toEqual(['company', 'city']);
    expect(outcome.file.rows).toEqual([
      ['Acme', 'Tbilisi'],
      ['Beta', 'Batumi'],
    ]);
  });

  it('still refuses what is not a workbook at all', async () => {
    await expect(parseListFile(Buffer.from('not a zip'), 'broken.xlsx')).resolves.toEqual({
      ok: false,
      reason: ListFileRefusal.Unreadable,
    });
  });
});

describe('the addresses filled in', () => {
  it('follow the one before, and keep the ones given', () => {
    const xml =
      '<row><c><v>1</v></c><c r="D1"><v>2</v></c><c/></row><row r="5"><c><v>3</v></c></row><row/>';
    expect(addressSheetXml(xml)).toBe(
      '<row r="1"><c r="A1"><v>1</v></c><c r="D1"><v>2</v></c><c r="E1"/></row>' +
        '<row r="5"><c r="A5"><v>3</v></c></row><row r="6"/>',
    );
  });

  it('leave column and other tags that start with the same letters alone', () => {
    const xml = '<cols><col min="1" max="1"/></cols><rowBreaks count="0"/>';
    expect(addressSheetXml(xml)).toBe(xml);
  });

  it('count columns the spreadsheet way', () => {
    expect([1, 26, 27, 52, 703].map(columnLetters)).toEqual(['A', 'Z', 'AA', 'AZ', 'AAA']);
    expect(['A', 'Z', 'AA', 'AZ', 'AAA'].map(columnNumber)).toEqual([1, 26, 27, 52, 703]);
  });
});
