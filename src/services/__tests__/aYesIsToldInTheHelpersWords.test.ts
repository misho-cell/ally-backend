import { AskTap, askTapLineForAsker } from '../askOpening';

/** T2476 (QA-003): a „yes" tap reached the asker as „says he will help", whatever was asked. */
describe('aYesIsToldInTheHelpersWords', () => {
  it('quotes the label the helper tapped', () => {
    expect(askTapLineForAsker(AskTap.Yes, 'ka', 'ზურა', 'კი, თავისუფალი ვარ')).toBe(
      'ზურა: „კი, თავისუფალი ვარ"',
    );
    expect(askTapLineForAsker(AskTap.Yes, 'en', 'Zura', 'Yes, I am free')).toBe(
      'Zura: "Yes, I am free"',
    );
  });

  it('keeps the general sentence when the label is in another language or missing', () => {
    expect(askTapLineForAsker(AskTap.Yes, 'en', 'Zura', 'კი, თავისუფალი ვარ')).toContain(
      'says they can help',
    );
    expect(askTapLineForAsker(AskTap.Yes, 'ka', 'ზურა')).toContain('ამბობს');
  });

  it('leaves „later" as it was', () => {
    expect(askTapLineForAsker(AskTap.Later, 'ka', 'ზურა', 'მოგვიანებით')).toBe(
      'ზურა მოგვიანებით გიპასუხებს.',
    );
  });
});
