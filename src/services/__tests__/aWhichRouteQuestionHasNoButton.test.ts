import { asksWhichRoute, withoutClosingApprovalAsk } from '../replyGuards';

/** The tester's 1145 (37808): „which route?" with no button to answer it. */
describe('a closing „which route?" with no button to answer it', () => {
  it('is recognised', () => {
    expect(asksWhichRoute('რომელი გზა წავიღო?')).toBe(true);
    expect(asksWhichRoute('Which route should I take?')).toBe(true);
    expect(asksWhichRoute('ანა დიზაინერია.')).toBe(false);
  });

  it('goes with the approval question, and the answer before it stays', () => {
    expect(withoutClosingApprovalAsk('ვიპოვე ანა დიზაინერი.\n\nრომელი გზა წავიღო?')).toBe(
      'ვიპოვე ანა დიზაინერი.',
    );
  });
});
