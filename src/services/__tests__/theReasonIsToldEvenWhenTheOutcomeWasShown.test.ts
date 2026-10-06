import { introOutcomeEvent } from '../taskEngine.events';

/**
 * #1750 (tester 40789, conv 40493): the refusal line was already on screen,
 * and „do not tell it again" made the run drop the reason with it. The line
 * on screen never carries the reason, so the event says so.
 */
describe('an outcome already shown in the goal thread', () => {
  it('with an answer: the yes or no is not repeated, the reason is told', () => {
    const event = introOutcomeEvent('Giorgi', false, 'kept_by_mediator', 'Eka', true, {
      answer: 'he is abroad for a month',
    });
    expect(event.en).toContain('They have NOT read the reason or condition below');
    expect(event.en).not.toContain('The owner has already read this answer');
    expect(event.en).toContain('<answer>he is abroad for a month</answer>');
    expect(event.ka).toContain('ჯერ არ წაუკითხავს');
  });

  it('without an answer: the whole outcome is not repeated', () => {
    const event = introOutcomeEvent('Giorgi', false, 'kept_by_mediator', 'Eka', true);
    expect(event.en).toContain('The owner has already read this answer');
    expect(event.en).not.toContain('NOT read the reason');
  });

  it('not shown: neither note', () => {
    const event = introOutcomeEvent('Giorgi', false, 'kept_by_mediator', 'Eka', false, {
      answer: 'he is abroad',
    });
    expect(event.en).not.toContain('already read');
  });
});
