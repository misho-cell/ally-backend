import { readFileSync } from 'fs';
import { join } from 'path';
import {
  ChoiceMeaning,
  isLaterButton,
  withoutLaterButton,
  withoutLaterOption,
} from '../askChoices';
import { introRequestChoices } from '../pendingMessages';

/** #6354, RULE D586 (Giorgi, G-093, 19 Oct): no card carries a „მოგვიანებით …" button. */
describe('#6354 D586: no card offers „later"', () => {
  it('knows a later button in every language, and nothing else', () => {
    expect(isLaterButton('მოგვიანებით გიპასუხებ')).toBe(true);
    expect(isLaterButton('მოგვიანებით შემახსენე')).toBe(true);
    expect(isLaterButton("I'll answer later")).toBe(true);
    expect(isLaterButton('Later')).toBe(true);
    expect(isLaterButton('Отвечу позже')).toBe(true);
    expect(isLaterButton('არა, ჯერ არა')).toBe(false);
    expect(isLaterButton('ვიცნობ, დავაკავშირებ')).toBe(false);
  });

  it('takes it off a helper’s question, by meaning or by label', () => {
    const asked = [
      { label: 'ვიცნობ, დავაკავშირებ', means: ChoiceMeaning.Yes },
      { label: 'არ ვიცნობ', means: ChoiceMeaning.No },
      { label: 'მოგვიანებით ვუპასუხებ', means: ChoiceMeaning.Later },
    ];
    expect(withoutLaterOption(asked).map((choice) => choice.label)).toEqual([
      'ვიცნობ, დავაკავშირებ',
      'არ ვიცნობ',
    ]);
  });

  it('takes it off the owner’s buttons; none stays none', () => {
    expect(withoutLaterButton(['კი', 'მოგვიანებით'])).toEqual(['კი']);
    expect(withoutLaterButton(null)).toBeNull();
  });

  it('leaves it off the server’s own cards', () => {
    expect(introRequestChoices('ka', 'ნიკა', 'გიორგი')).toHaveLength(2);
    const pending = readFileSync(join(__dirname, '..', 'pendingMessages.ts'), 'utf8');
    expect(pending).not.toContain('t.later');
  });

  it('is applied where the buttons are stored and a question’s are built', () => {
    const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
    const asks = readFileSync(join(__dirname, '..', 'taskAsks.service.ts'), 'utf8');
    expect(chat).toContain('const storedChoices = withoutLaterButton(');
    expect(asks).toContain('withoutLaterOption(');
  });
});
