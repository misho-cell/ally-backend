import { rewriteFrom } from '../askEditor.service';
import { thirdPersonTurnedToYou } from '../personFlip';

/** #2212 turn 5 (the tester's 44884): „მუშაობს" about the craftsman must not reach the helper as „მუშაობ". */
describe('theEditorDoesNotTurnHimIntoYou', () => {
  it('sees a third-person verb turned into „you"', () => {
    expect(thirdPersonTurnedToYou('შაბათსაც მუშაობს?', 'შაბათობითაც მუშაობ?')).toBe(true);
    expect(thirdPersonTurnedToYou('ზაზა ფილებს აკეთებს?', 'ფილებს აკეთებ?')).toBe(true);
  });

  it('leaves a rewrite that keeps the third person, or changes only a name’s case', () => {
    expect(thirdPersonTurnedToYou('შაბათსაც მუშაობს?', 'ზაზა შაბათსაც მუშაობს?')).toBe(false);
    expect(thirdPersonTurnedToYou('ზაზას იცნობ?', 'ზაზა გახსოვს?')).toBe(false);
    expect(thirdPersonTurnedToYou('შაბათსაც მუშაობ?', 'შაბათსაც მუშაობ?')).toBe(false);
  });

  const CHOICES = [
    { label: 'კი, მუშაობს', means: 'yes' },
    { label: 'არა', means: 'no' },
  ];
  const DRAFT = { question: 'შაბათსაც მუშაობს?', choices: [] };

  it('keeps the draft when the editor turns him into „you"', () => {
    expect(
      rewriteFrom({ ok: false, question: 'შაბათობითაც მუშაობ?', choices: CHOICES }, DRAFT),
    ).toBeNull();
  });

  it('uses a rewrite that keeps him in the third person', () => {
    const rewrite = { ok: false, question: 'ზაზა შაბათობითაც მუშაობს?', choices: CHOICES };
    expect(rewriteFrom(rewrite, DRAFT)?.question).toBe('ზაზა შაბათობითაც მუშაობს?');
  });
});
