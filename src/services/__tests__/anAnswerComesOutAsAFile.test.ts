import JSZip from 'jszip';
import { readFileSync } from 'fs';
import { join } from 'path';
import { docxFile, markdownFile } from '../messageDocument';

/** Board #894 (b), the founder, 4 Oct: any answer comes out as Word or Markdown. */
const reply = [
  '## ბუღალტრები',
  'ვიპოვე ორი ადამიანი:',
  '- **ნინო ბერიძე** — ვაკე',
  '2. Giorgi & Co <ltd>',
].join('\n');

describe('an answer as Markdown', () => {
  it('is the reply itself, UTF-8 with the byte-order mark', () => {
    const file = markdownFile(reply);
    expect([...file.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    expect(file.subarray(3).toString('utf8')).toBe(`${reply}\n`);
  });
});

describe('an answer as Word', () => {
  const documentOf = async (text: string): Promise<string> => {
    const zip = await JSZip.loadAsync(await docxFile(text));
    expect(Object.keys(zip.files).sort()).toEqual(
      ['[Content_Types].xml', '_rels/', '_rels/.rels', 'word/', 'word/document.xml'].sort(),
    );
    return (await zip.file('word/document.xml')?.async('string')) ?? '';
  };

  it('keeps every line, the Georgian text readable', async () => {
    const xml = await documentOf(reply);
    expect(xml.match(/<w:p>/gu)).toHaveLength(4);
    expect(xml).toContain('ვიპოვე ორი ადამიანი:');
  });

  it('makes a heading and **bold** bold, and a list item a bullet', async () => {
    const xml = await documentOf(reply);
    expect(xml).toContain('<w:rPr><w:b/></w:rPr><w:t xml:space="preserve">ბუღალტრები</w:t>');
    expect(xml).toContain('<w:t xml:space="preserve">• </w:t>');
    // The tester's 65714: a numbered item keeps its number.
    expect(xml).toContain('<w:t xml:space="preserve">2. Giorgi &amp; Co &lt;ltd&gt;</w:t>');
    expect(xml).not.toContain('• 2');
    expect(xml).toContain('<w:rPr><w:b/></w:rPr><w:t xml:space="preserve">ნინო ბერიძე</w:t>');
  });

  it('escapes what XML cannot hold', async () => {
    const xml = await documentOf('a & b <c>\u0007');
    expect(xml).toContain('a &amp; b &lt;c&gt;</w:t>');
  });
});

describe('GET /threads/:id/messages/:messageId/answer.:format', () => {
  const routes = readFileSync(
    join(__dirname, '..', '..', 'api', 'routes', 'threads.routes.ts'),
    'utf8',
  );
  const at = routes.indexOf("'/:id/messages/:messageId/answer.:format'");
  const handler = routes.slice(at, at + 1_800);

  it('exists, rate-limited and validated, md or docx only', () => {
    expect(at).toBeGreaterThan(-1);
    expect(handler).toContain('rateLimit(');
    expect(handler).toContain("param('messageId').matches(MESSAGE_ID_RE)");
    expect(handler).toContain("param('format').isIn(Object.keys(ANSWER_FILES))");
  });

  it('reads the reply only after the thread is the caller’s own, and 404s otherwise', () => {
    expect(handler).toContain('const thread = await getThread(threadId, userId);');
    expect(handler).toMatch(/thread === null \? null : await shownAssistantReply\(/u);
    expect(handler).toContain('res.status(404)');
  });
});
