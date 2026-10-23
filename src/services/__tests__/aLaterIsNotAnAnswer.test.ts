import { readFileSync } from 'fs';
import { join } from 'path';
import { AskTap, askTapOf, laterChoice } from '../askOpening';
import { isTypedLater } from '../laterChoices';

/** RW-002 (WIDE GATE): a „later" tap went out as an answer card and closed the ask. */
describe('aLaterIsNotAnAnswer', () => {
  it('knows the later button and a typed later', () => {
    expect(askTapOf(laterChoice('ka'))).toBe(AskTap.Later);
    expect(isTypedLater('მოგვიანებით')).toBe(true);
  });

  it('is refused before an answer is recorded', () => {
    const source = readFileSync(join(__dirname, '..', 'taskAsks.service.ts'), 'utf8');
    const refused = source.indexOf(
      '(askTapOf(approvedText.trim()) === AskTap.Later || isTypedLater(approvedText))',
    );
    const recorded = source.indexOf(
      'const captured = await recordAskAnswer(askThreadId, answerText);',
      refused,
    );
    expect(refused).toBeGreaterThan(0);
    expect(recorded).toBeGreaterThan(refused);
  });

  // #7459 retest (tester 73833): after the answer went, a timing line is more for the asker.
  it('is refused only while the question is still unanswered', () => {
    const source = readFileSync(join(__dirname, '..', 'taskAsks.service.ts'), 'utf8');
    const gate = source.slice(source.indexOf("row.status !== 'answered' &&"));
    expect(gate.slice(0, 200)).toContain(
      '(askTapOf(approvedText.trim()) === AskTap.Later || isTypedLater(approvedText))',
    );
  });
});
