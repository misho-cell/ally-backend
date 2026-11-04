import { approvalBelongsToThePlan, planApprovalRefusal } from '../chat.service';

/**
 * #8779 (the founder, 4 Nov 19:07): no fixed word lists. Whether the owner's
 * words approve the plan is the model's reading (confirmed=true); the server
 * checks only the structure of the screen.
 */
const PLAN = ['ვადასტურებ', 'შევცვალოთ'];
const MISHO_1555 =
  'რამოდენიმე დღის წინ გთხოვე საკითხის მოგვარება და გითხარი ვისთანაც საჭიროდ ჩათვლი დაკავშირებას დაუკავშირდითქო';

describe('the owner’s yes to a plan on screen', () => {
  it('is whatever they wrote, once the model has read it as a yes', () => {
    for (const said of ['კარგი დაელაპარაკე', MISHO_1555, 'აბა ჰე, მიდი', 'ok go'])
      expect(approvalBelongsToThePlan(said, PLAN, [said])).toBe(true);
  });

  it('needs something written by the owner', () => {
    expect(approvalBelongsToThePlan(null, PLAN, [])).toBe(false);
    expect(approvalBelongsToThePlan('   ', null, [])).toBe(false);
  });

  // #8779 a1 retest (82682): no plan buttons — the plan is asked in words, „ჰო, გაუშვი" answers it.
  it('is a yes to a plan asked in words, with no card at all', () => {
    expect(approvalBelongsToThePlan('ჰო, გაუშვი', null, [])).toBe(true);
  });

  it('is never a press of a draft card’s own button (G2)', () => {
    expect(
      approvalBelongsToThePlan('კი, გააგზავნე', ['კი, გააგზავნე', 'არა'], ['კი, გააგზავნე']),
    ).toBe(false);
  });

  it('is not a press of another card’s button (G2)', () => {
    expect(
      approvalBelongsToThePlan('კი, გააგზავნე', PLAN, ['კი, გააგზავნე'], ['კი, გააგზავნე']),
    ).toBe(false);
  });

  it('still needs confirmed=true from the model', () => {
    expect(planApprovalRefusal(false, null)?.reason).toBe('not_confirmed');
  });
});
