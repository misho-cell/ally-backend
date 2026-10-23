/**
 * #7459 retest (tester 73833, thread 64693): „კი, გავაცნობ" reached the asker
 * on arrival; the run called no tool and told the helper „პასუხი ჩვენი მხრიდან
 * ვერ გადაიგზავნა".
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { claimsNotSent, withoutNotSentSentences } from '../chat.service';

describe('a „not sent" line the server knows to be false', () => {
  it('reads the 64693 sentence and its siblings as „not sent"', () => {
    expect(claimsNotSent('მადლობა. პასუხი ჩვენი მხრიდან ვერ გადაიგზავნა.')).toBe(true);
    expect(claimsNotSent('დამატებითი პასუხი ჩვენი მხრიდან ვერ გაიგზავნა.')).toBe(true);
    expect(claimsNotSent('Your answer could not be sent.')).toBe(true);
  });

  it('does not read the agreed sent line as „not sent"', () => {
    expect(claimsNotSent('მადლობა, პასუხი გაიგზავნა.')).toBe(false);
  });

  it('drops only the „not sent" sentence and keeps the thanks', () => {
    expect(withoutNotSentSentences('მადლობა. პასუხი ჩვენი მხრიდან ვერ გადაიგზავნა.')).toBe(
      'მადლობა.',
    );
  });

  it('is applied on the helper’s side, only when the answer went during this run', () => {
    const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
    const at = chat.indexOf("thread?.type === 'incoming_ask' &&");
    expect(at).toBeGreaterThan(0);
    const gate = chat.slice(at, at + 400);
    expect(gate).toContain('claimsNotSent(effectiveFinal)');
    expect(gate).toContain('(await askAnsweredSince(threadId, startedAt))');
    expect(gate).toContain('runAnswerSent.add(runId);');
  });
});
