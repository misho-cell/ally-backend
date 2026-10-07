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
      'if (askTapOf(approvedText.trim()) === AskTap.Later || isTypedLater(approvedText)) {',
    );
    const recorded = source.indexOf(
      'const captured = await recordAskAnswer(askThreadId, answerText);',
      refused,
    );
    expect(refused).toBeGreaterThan(0);
    expect(recorded).toBeGreaterThan(refused);
  });
});
