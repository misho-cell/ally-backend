/**
 * pdf.js starts its worker with a dynamic import, which Jest's module sandbox
 * refuses. The REAL library therefore runs in a plain Node child — the same
 * way it runs on the server — and its answer is handed back here.
 */
jest.mock('pdf-parse', () => {
  const { execFileSync } = jest.requireActual<typeof import('child_process')>('child_process');
  const READ_IN_NODE = `
    const { PDFParse } = require('pdf-parse');
    const data = Buffer.from(require('fs').readFileSync(0, 'utf8'), 'base64');
    const options = JSON.parse(process.argv[1]);
    const parser = new PDFParse({ data: new Uint8Array(data) });
    parser.getText(options)
      .then((r) => process.stdout.write(JSON.stringify({ text: r.text })))
      .catch((e) => process.stdout.write(JSON.stringify({ error: e.message })))
      .finally(() => parser.destroy());`;
  class ChildPdfParse {
    constructor(private readonly options: { data: Uint8Array }) {}
    async getText(params: unknown): Promise<{ text: string }> {
      const out = execFileSync('node', ['-e', READ_IN_NODE, JSON.stringify(params)], {
        input: Buffer.from(this.options.data).toString('base64'),
        cwd: process.cwd(),
      }).toString();
      const answer = JSON.parse(out) as { text?: string; error?: string };
      if (answer.error !== undefined) throw new Error(answer.error);
      return { text: answer.text ?? '' };
    }
    async destroy(): Promise<void> {
      return undefined;
    }
  }
  return { PDFParse: ChildPdfParse };
});

import JSZip from 'jszip';
import { docxBodyText } from '../documentText';
import {
  ListFileKind,
  ListFileRefusal,
  listFileKind,
  listFileSummary,
  parseListFile,
} from '../listFile';

/** A one-page PDF whose text layer says what it is given (ASCII only). */
function onePagePdf(lines: readonly string[]): Buffer {
  const ops = lines
    .map((line, i) => `BT /F1 12 Tf 20 ${700 - i * 16} Td (${line}) Tj ET`)
    .join('\n');
  const objects = [
    '<</Type/Catalog/Pages 2 0 R>>',
    '<</Type/Pages/Kids[3 0 R]/Count 1>>',
    '<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>',
    `<</Length ${ops.length}>>stream\n${ops}\nendstream`,
    '<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>',
  ];
  let body = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((object, i) => {
    offsets.push(body.length);
    body += `${i + 1} 0 obj${object}endobj\n`;
  });
  const xref = body.length;
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  body += offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('');
  body += `trailer<</Size ${objects.length + 1}/Root 1 0 R>>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(body, 'latin1');
}

async function wordFile(documentXml: string): Promise<Buffer> {
  const zip = new JSZip();
  zip.file('word/document.xml', documentXml);
  return zip.generateAsync({ type: 'nodebuffer' });
}

const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';

/** #7393 (the founder, 23 Oct): a PDF or a Word file is read, not refused. */
describe('a PDF and a Word file are read', () => {
  it('knows both by their extension', () => {
    expect(listFileKind('report.PDF')).toBe(ListFileKind.Pdf);
    expect(listFileKind('list.docx')).toBe(ListFileKind.Docx);
    expect(listFileKind('old.doc')).toBeNull();
  });

  it('reads a text PDF, line by line', async () => {
    const outcome = await parseListFile(onePagePdf(['TBC Bank', 'Bank of Georgia']), 'banks.pdf');
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.file.kind).toBe(ListFileKind.Pdf);
    expect(outcome.file.text).toContain('TBC Bank');
    expect(outcome.file.text).toContain('Bank of Georgia');
    expect(listFileSummary(outcome.file, 'ka')).toMatch(
      /^ფაილი წავიკითხე: ტექსტი, \d+ სიმბოლო\.$/u,
    );
  });

  it('calls a PDF with no text layer (a scan) empty, in the existing line', async () => {
    const outcome = await parseListFile(onePagePdf([]), 'scan.pdf');
    expect(outcome).toEqual({ ok: false, reason: ListFileRefusal.Empty });
  });

  it('calls a broken PDF unreadable', async () => {
    const outcome = await parseListFile(Buffer.from('%PDF-1.4 not really'), 'broken.pdf');
    expect(outcome).toEqual({ ok: false, reason: ListFileRefusal.Unreadable });
  });

  it('reads a Word file: paragraphs, Georgian text and a table row', async () => {
    const xml =
      `<w:document ${W}><w:body>` +
      '<w:p><w:r><w:t>კომპანიები</w:t></w:r></w:p>' +
      '<w:p><w:r><w:t xml:space="preserve">TBC &amp; Co</w:t></w:r></w:p>' +
      '<w:tbl><w:tr><w:tc><w:p><w:r><w:t>Liberty</w:t></w:r></w:p></w:tc>' +
      '<w:tc><w:p><w:r><w:t>Tbilisi</w:t></w:r></w:p></w:tc></w:tr></w:tbl>' +
      '</w:body></w:document>';
    const outcome = await parseListFile(await wordFile(xml), 'list.docx');
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.file.kind).toBe(ListFileKind.Docx);
    expect(outcome.file.text).toContain('კომპანიები');
    expect(outcome.file.text).toContain('TBC & Co');
    expect(outcome.file.text).toMatch(/Liberty\s*\n?\s*\|\s*Tbilisi/u);
  });

  it('calls a zip that is not a Word file unreadable', async () => {
    const zip = new JSZip();
    zip.file('other.txt', 'x');
    const outcome = await parseListFile(await zip.generateAsync({ type: 'nodebuffer' }), 'x.docx');
    expect(outcome).toEqual({ ok: false, reason: ListFileRefusal.Unreadable });
  });

  it('turns Word markup into lines, tabs and decoded characters', () => {
    expect(
      docxBodyText(
        '<w:p><w:r><w:t>a</w:t><w:tab/><w:t>b</w:t><w:br/><w:t>&#4304;&#x10D1;</w:t></w:r></w:p>',
      ),
    ).toBe('a\tb\nაბ');
  });
});
