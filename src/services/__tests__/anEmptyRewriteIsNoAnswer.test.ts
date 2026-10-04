import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * The tester's 1142 (37576): GPT returned only the buttons line, the stored
 * final was empty, and the owner read „აირჩიე ერთ-ერთი:" over three buttons
 * with no answer at all. An empty rewrite is no answer: Claude's own stands.
 */
const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');

describe('a rewrite that came back empty', () => {
  it('leaves Claude’s own answer in place, and says so in the log', () => {
    const at = chat.indexOf('const split = splitButtons(rewritten.text);');
    const block = chat.slice(at, at + 900);
    expect(block).toContain("if (finalText.trim() === '') {");
    expect(block).toContain('finalText = scrubFinal(extractText(response.content), runId);');
    expect(block).toContain('answeredBy = MODEL;');
    expect(block).toContain("the rewrite was empty — Claude's answer stands");
  });
});
