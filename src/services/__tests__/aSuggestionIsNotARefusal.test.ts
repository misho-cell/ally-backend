import { introOutcomeEvent } from '../taskEngine.events';
import { refersSomebody } from '../referralRecommendation';

/** #5249 part 2 (the tester's 22:14Z, thread 59404): a no that names somebody else is a suggestion. */
describe('a mediator who points to somebody else', () => {
  it('is told to the run as a suggestion to put to the owner, not as a decline', () => {
    const event = introOutcomeEvent('თიკო', false, 'kept_by_mediator', 'ბესო', true, {
      answer: 'Tiko can not help; talk to Levan G., my friend Dato knows him',
      suggestsSomeoneElse: true,
    });
    expect(event.en).toContain('This is a suggestion, not a refusal');
    expect(event.en).toContain('do nothing on it before the owner says yes');
    expect(event.en).not.toContain('declined the introduction');
    expect(event.ka).toContain('ეს რჩევაა და არა უარი');
  });

  it('stays a plain decline when the answer names nobody', () => {
    const event = introOutcomeEvent('თიკო', false, 'kept_by_mediator', 'ბესო', true, {
      answer: 'ვერ დაგეხმარები',
      suggestsSomeoneElse: false,
    });
    expect(event.en).toContain('declined the introduction');
  });

  it('reads the tester’s line as one that refers somebody', () => {
    expect(refersSomebody('Tiko can not help; talk to Levan G., my friend Dato knows him')).toBe(
      true,
    );
    expect(
      refersSomebody(
        "Tiko can't help; ask Levan G., TBC business-loans manager — my friend Dato knows him",
      ),
    ).toBe(true);
    expect(refersSomebody('ვერ დაგეხმარები')).toBe(false);
  });
});
