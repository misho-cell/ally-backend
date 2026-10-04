import { readFileSync } from 'fs';
import { join } from 'path';
import { unusableReason } from '../finalAnswer.service';

/**
 * The tester's 1145 (37877): „Owner's own network has nobody under this word,
 * so let me check the real size of the pool and try the web instead." reached a
 * Georgian owner as a step between the answer card and the reply.
 */
describe('a step in the wrong language', () => {
  it('fails the final answer’s own language test in a Georgian thread', () => {
    const note =
      "Owner's own network has nobody under this word, so let me check the real size of the pool and try the web instead.";
    expect(unusableReason(note, 'ka')).not.toBeNull();
    expect(unusableReason('ვებზე ვეძებ ტორტის გამომცხობებს თბილისში.', 'ka')).toBeNull();
    expect(unusableReason(note, 'en')).toBeNull();
  });

  it('is dropped by the step scrub, which every caller already skips when empty', () => {
    const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
    const fn = chat.slice(chat.indexOf('function scrubStep('));
    const body = fn.slice(0, fn.indexOf('\n}\n'));
    expect(body).toContain('const wrongLanguage = unusableReason(step, runLang(runId));');
    expect(body).toContain("return '';");
  });
});
