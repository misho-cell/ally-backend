import { readFileSync } from 'fs';
import { join } from 'path';
import { withoutSendItQuestion } from '../replyGuards';

/**
 * The tester's 1142 (37517): the introduction request went out in the run and
 * the reply closed on „ნანას გავუგზავნო ეს თხოვნა?".
 */
const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');

describe('a closing „shall I send it?" after the request went', () => {
  it('is replaced with the truth, and what came before stays', () => {
    const reply = 'ნანა შენს კონტაქტშია და ნეტაის იყენებს.\n\nნანას გავუგზავნო ეს თხოვნა?';
    expect(withoutSendItQuestion(reply, 'ka')).toBe(
      'ნანა შენს კონტაქტშია და ნეტაის იყენებს.\n\nთხოვნა უკვე გაიგზავნა — როგორც კი უპასუხებენ, აქ გეტყვი.',
    );
  });

  it('leaves any other closing question alone', () => {
    const reply = 'ნანას ვთხოვე. რამე დავამატო?';
    expect(withoutSendItQuestion(reply, 'ka')).toBe(reply);
  });

  it('runs only in a run that sent an introduction request', () => {
    expect(chat).toContain('if (runId) runIntroSent.add(runId);');
    expect(chat).toContain(
      'if (runIntroSent.has(runId)) effectiveFinal = withoutSendItQuestion(effectiveFinal, language);',
    );
  });
});
