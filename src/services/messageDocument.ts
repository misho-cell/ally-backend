import JSZip from 'jszip';

/**
 * Board #894 (b), the founder, 4 Oct: files come OUT of Netai too, and any
 * answer can be had as Word or Markdown. A list already comes out as Excel
 * (table.xlsx). This writes one reply, exactly as the owner reads it, as a
 * Markdown file or as a Word document — paragraphs, bullets and bold kept.
 *
 * PDF is not here: Georgian needs a font embedded in the file, and the repo
 * has none yet.
 */
export const MARKDOWN_CONTENT_TYPE = 'text/markdown; charset=utf-8';
export const DOCX_CONTENT_TYPE =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

const BULLET_RE = /^\s*(?:[-*•]|\d+[.)])\s+/u;
const HEADING_RE = /^\s*#{1,6}\s+/u;
const BOLD_RE = /\*\*([^*]+)\*\*/gu;
const BULLET_MARK = '• ';

/** Markdown is the reply itself, as UTF-8 with the byte-order mark Windows editors need for Georgian. */
export function markdownFile(reply: string): Buffer {
  return Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(`${reply.trim()}\n`, 'utf8')]);
}

// eslint-disable-next-line no-control-regex
const NOT_IN_XML_RE = /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/gu;

function escapeXml(text: string): string {
  return text
    .replace(NOT_IN_XML_RE, '')
    .replace(/&/gu, '&amp;')
    .replace(/</gu, '&lt;')
    .replace(/>/gu, '&gt;')
    .replace(/"/gu, '&quot;');
}

interface Run {
  readonly text: string;
  readonly bold: boolean;
}

/** One line's text split into plain and **bold** runs. */
function runsOf(line: string, wholeLineBold: boolean): Run[] {
  const runs: Run[] = [];
  let last = 0;
  for (const match of line.matchAll(BOLD_RE)) {
    const at = match.index ?? 0;
    if (at > last) runs.push({ text: line.slice(last, at), bold: wholeLineBold });
    runs.push({ text: match[1], bold: true });
    last = at + match[0].length;
  }
  if (last < line.length) runs.push({ text: line.slice(last), bold: wholeLineBold });
  return runs;
}

function runXml(run: Run): string {
  const props = run.bold ? '<w:rPr><w:b/></w:rPr>' : '';
  return `<w:r>${props}<w:t xml:space="preserve">${escapeXml(run.text)}</w:t></w:r>`;
}

/** One reply line as a Word paragraph: a heading is bold, a list item starts with a bullet. */
function paragraphXml(line: string): string {
  const heading = HEADING_RE.test(line);
  const bullet = !heading && BULLET_RE.test(line);
  const text = heading
    ? line.replace(HEADING_RE, '')
    : bullet
      ? `${BULLET_MARK}${line.replace(BULLET_RE, '')}`
      : line;
  return `<w:p>${runsOf(text, heading).map(runXml).join('')}</w:p>`;
}

function documentXml(reply: string): string {
  const paragraphs = reply
    .trim()
    .split('\n')
    .map((line) => line.trimEnd())
    .map(paragraphXml)
    .join('');
  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
    `<w:body>${paragraphs}<w:sectPr/></w:body></w:document>`
  );
}

const CONTENT_TYPES_XML =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
  '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
  '<Default Extension="xml" ContentType="application/xml"/>' +
  '<Override PartName="/word/document.xml" ' +
  'ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
  '</Types>';

const ROOT_RELS_XML =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
  '<Relationship Id="rId1" ' +
  'Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" ' +
  'Target="word/document.xml"/>' +
  '</Relationships>';

/** The reply as a .docx: the three parts Word needs, nothing else. */
export async function docxFile(reply: string): Promise<Buffer> {
  const zip = new JSZip();
  zip.file('[Content_Types].xml', CONTENT_TYPES_XML);
  zip.file('_rels/.rels', ROOT_RELS_XML);
  zip.file('word/document.xml', documentXml(reply));
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}
