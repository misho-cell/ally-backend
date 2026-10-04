import { readFileSync } from 'fs';
import { join } from 'path';
import { withoutOpeningSolvedWhen } from '../replyGuards';

/**
 * The tester's 37629: the first reply on a goal opened on the plan's own first
 * line, „მოგვარებულად ჩაითვლება, როცა…", with no plan proposed.
 */
const reply =
  'მოგვარებულად ჩაითვლება, როცა იპოვი თბილისში მასწავლებელს.\n\n' +
  'შევარჩევ რამდენიმე შესაბამის ვარიანტს. ბავშვს ფორტეპიანოზე ადრე უვარჯიშია?';

describe('an opening paragraph that defines „solved"', () => {
  it('goes, and the rest of the reply stays', () => {
    expect(withoutOpeningSolvedWhen(reply)).toBe(
      'შევარჩევ რამდენიმე შესაბამის ვარიანტს. ბავშვს ფორტეპიანოზე ადრე უვარჯიშია?',
    );
    expect(
      withoutOpeningSolvedWhen('This counts as solved when you have a teacher.\n\nOne question?'),
    ).toBe('One question?');
  });

  it('stays when it is the whole reply, or not at the opening', () => {
    expect(withoutOpeningSolvedWhen('მოგვარებულად ჩაითვლება, როცა იპოვი.')).toBe(
      'მოგვარებულად ჩაითვლება, როცა იპოვი.',
    );
    const later = 'ვიპოვე ორი მასწავლებელი.\n\nმოგვარებულად ჩაითვლება, როცა შეხვდები.';
    expect(withoutOpeningSolvedWhen(later)).toBe(later);
  });

  it('is applied only to a run that proposed no plan', () => {
    const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
    expect(chat).toContain(
      'if (!runPlanForReply.has(runId)) effectiveFinal = withoutOpeningSolvedWhen(effectiveFinal);',
    );
  });
});
