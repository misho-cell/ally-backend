import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * #7229 (tester 75439, owner thread 65352): ask_contact answered „Nothing sent:
 * that goal lives in another conversation…" — a refusal that returns before
 * createAsk, so the run was never marked refused — and the reply said „I sent a
 * question to Giorgi's assistant". Every refused ask_contact marks the run, so
 * the refused-ask claim guard sees it.
 */
const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');

describe('an ask refused before it reached createAsk', () => {
  it('marks the run refused for every ask_contact that did not send', () => {
    const fn = chat.slice(chat.indexOf('function noteAskRefused('));
    const body = fn.slice(0, fn.indexOf('\n}\n'));
    expect(body).toContain("if (toolName !== 'ask_contact') return;");
    expect(body).toContain('if (sent !== true) runAskRefused.add(runId);');
  });

  it('is noted on every tool result, beside the other per-call notes', () => {
    expect(chat).toContain(
      '  noteRouteClosed(runId, block.name, rawResult);\n  noteAskRefused(runId, block.name, rawResult);\n',
    );
  });

  it('the early refusal is one of those results', () => {
    expect(chat).toContain('return { sent: false, error: ASK_BELONGS_HERE_NOTE };');
  });

  it('feeds the guard that rewrites a claimed send', () => {
    const guard = chat.slice(chat.indexOf('const claimedARefusedAsk ='));
    expect(guard.slice(0, guard.indexOf(';'))).toContain('runAskRefused.has(runId)');
  });
});
