/**
 * #7459 retest (tester 73833, thread 64693): „კი, გავაცნობ" reached the asker
 * on arrival; the run called no tool and told the helper „პასუხი ჩვენი მხრიდან
 * ვერ გადაიგზავნა". #8779 c: which sentences say „not sent" is the small
 * model's reading; the server drops them only when the answer did go.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

describe('a „not sent" line the server knows to be false', () => {
  it('is applied on the helper’s side, only when the answer went during this run', () => {
    const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
    const at = chat.indexOf('const notSentSaid =');
    expect(at).toBeGreaterThan(0);
    const gate = chat.slice(at, at + 600);
    expect(gate).toContain("thread?.type === 'incoming_ask' && !runAnswerSent.has(runId)");
    expect(gate).toContain('ClaimKind.NotSent');
    expect(gate).toContain('(await askAnsweredSince(threadId, startedAt))');
    expect(gate).toContain('effectiveFinal = withoutSentences(effectiveFinal, notSentSaid);');
    expect(gate).toContain('runAnswerSent.add(runId);');
  });
});
