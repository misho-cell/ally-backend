import { introOutcomeEvent } from '../taskEngine.events';

/** #1651 (conv 40196): the refusal was written into the goal thread, then told again by the run. */
describe('an introduction outcome already on the owner’s screen', () => {
  it('tells the run not to repeat it', () => {
    const event = introOutcomeEvent('ნანა', false, 'kept_by_mediator', 'ლიკა', true);
    expect(event.ka).toContain('ხელახლა ნუ ეტყვი');
    expect(event.en).toContain('do not tell it again');
  });

  it('is told as before when nothing was written', () => {
    const event = introOutcomeEvent('ნანა', false, 'kept_by_mediator', 'ლიკა');
    expect(event.ka).not.toContain('ხელახლა ნუ ეტყვი');
    expect(event.ka).toContain('უთხარი მფლობელს');
  });
});
