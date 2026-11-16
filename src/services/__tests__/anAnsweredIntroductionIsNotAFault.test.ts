import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * 16 Nov, alert 628 (a real member). An introduction request waited; the owner
 * wrote „tell Levan I do not know Lasha". The run called respond_to_introduction
 * with the decline and her words, and they went. The unsent-instruction guard
 * did not count that answer, and forced the reply into „the question could not
 * be sent, our fault".
 */
describe('a run that answered an introduction request', () => {
  const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
  const at = chat.indexOf("case 'respond_to_introduction': {");
  const handler = chat.slice(at, chat.indexOf("case 'get_intro_status':", at));

  it('counts the answer that went as the instruction carried out', () => {
    expect(handler).toContain('return answerSent(runId, answer(requestId));');
    expect(handler).toContain('return answerSent(\n            runId,');
  });

  it('counts only an answer that went', () => {
    const helper = chat.slice(chat.indexOf('async function answerSent('));
    expect(helper).toContain(
      'if (runId !== undefined && (result as { success?: unknown }).success === true) {',
    );
  });

  it('is what the guard reads', () => {
    const guard = chat.slice(chat.indexOf('const instructionUnsent ='));
    expect(guard.slice(0, 2000)).toContain('!runIntroSent.has(runId) &&');
  });
});
