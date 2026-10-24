import JSZip from 'jszip';

/**
 * #7393 (the founder, 23 Oct 01:22 Tbilisi: „I wanted to upload a PDF today and
 * it was impossible"): a PDF or a Word file is read as text, the way a .txt is
 * (#892). Like the rest of the list-file path this only READS — the text is the
 * owner's data, never an instruction (#895).
 *
 * A text PDF is read directly. A scanned one has no text layer and comes back
 * empty, which the caller says in its existing plain line.
 */
const MAX_PDF_PAGES = 100;
const DOCX_BODY_PATH = 'word/document.xml';

/** Every page's text with pdf-parse 2 (pdfjs 5), which needs Node 20.16 or later. */
async function pdfTextCurrent(buffer: Buffer): Promise<string> {
  const { PDFParse } = await import('pdf-parse');
  const parser = new PDFParse({ data: new Uint8Array(buffer) });
  try {
    const result = await parser.getText({ last: MAX_PDF_PAGES, pageJoiner: '' });
    return result.text.trim();
  } finally {
    await parser.destroy();
  }
}

/** Every page's text with pdf-parse 1 (its own pdf.js), which reads on Node 18. */
async function pdfTextLegacy(buffer: Buffer): Promise<string> {
  const { default: readPdf } = await import('pdf-parse-legacy/lib/pdf-parse.js');
  const result = await readPdf(buffer, { max: MAX_PDF_PAGES });
  return result.text.trim();
}

/**
 * Every page's text, pages one after another; empty for a scan.
 *
 * pdf-parse is loaded here, on the first PDF, never at startup: it brings
 * pdfjs 5 and a native canvas package, and on 23 Oct 09:38Z a build that
 * loaded it at startup never came up (every route 502 until the rollback).
 * A parser that cannot load now fails one upload, not the server.
 *
 * #7393 retest (tester 73723, PDF FAIL 2/2): the server runs Node 18, and
 * pdfjs 5 needs Node 20.16. Checked on a 5-page text PDF: pdf-parse 1 reads it
 * on Node 18 and fails on Node 22; pdf-parse 2 is the reverse. So the current
 * one is tried first and the old one reads when it cannot, on either runtime.
 */
export async function pdfText(buffer: Buffer): Promise<string> {
  try {
    return await pdfTextCurrent(buffer);
  } catch (current) {
    // eslint-disable-next-line no-console
    console.warn(
      '[pdf] pdf-parse 2 could not read; trying pdf-parse 1:',
      (current as Error).message,
    );
    return pdfTextLegacy(buffer);
  }
}

const XML_ENTITIES: Readonly<Record<string, string>> = {
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&apos;': "'",
  '&amp;': '&',
};
const XML_ENTITY_RE = /&(?:lt|gt|quot|apos|amp);/gu;
const XML_NUMERIC_ENTITY_RE = /&#(x?)([0-9a-fA-F]+);/gu;

function decodeXml(text: string): string {
  return text
    .replace(XML_NUMERIC_ENTITY_RE, (_m, hex: string, code: string) =>
      String.fromCodePoint(parseInt(code, hex === 'x' ? 16 : 10)),
    )
    .replace(XML_ENTITY_RE, (entity) => XML_ENTITIES[entity] ?? entity);
}

/**
 * The body of a .docx as plain text: one line per paragraph, a table row as
 * its cells joined by „ | " (the shape a CSV row is given), tabs and line
 * breaks kept.
 */
export function docxBodyText(documentXml: string): string {
  const marked = documentXml
    .replace(/<w:tab\/>/gu, '\t')
    .replace(/<w:br\/>/gu, '\n')
    .replace(/<\/w:p>/gu, '\n')
    .replace(/<\/w:tc>/gu, ' | ')
    .replace(/<\/w:tr>/gu, '\n')
    .replace(/<[^>]+>/gu, '');
  return decodeXml(marked)
    .split('\n')
    .map((line) => line.replace(/(?:\s*\|\s*)+$/u, '').trimEnd())
    .join('\n')
    .replace(/\n{3,}/gu, '\n\n')
    .trim();
}

/** A Word (.docx) file's text; throws when the file is not a Word document. */
export async function docxText(buffer: Buffer): Promise<string> {
  const zip = await JSZip.loadAsync(buffer);
  const body = zip.file(DOCX_BODY_PATH);
  if (body === null) throw new Error('no word/document.xml — not a Word document');
  return docxBodyText(await body.async('string'));
}
