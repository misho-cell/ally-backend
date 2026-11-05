import { readFileSync } from 'fs';
import { join } from 'path';
import { introOutcomeEvent } from '../taskEngine.events';

/**
 * #5249 part 2 (the tester's 22:14Z, thread 59404): a no that names somebody else
 * is a suggestion. #8779 group 4: whether it names somebody is the model's reading
 * of the answer — the event carries the rule, no word list decides it.
 */
describe('a mediator’s decline that came with words', () => {
  const event = introOutcomeEvent('თიკო', false, 'kept_by_mediator', 'ბესო', true, {
    answer: 'Tiko can not help; talk to Levan G., my friend Dato knows him',
  });

  it('tells the run a suggestion is not a refusal, and to wait for the owner', () => {
    expect(event.en).toContain('If their answer suggests someone else, that is a suggestion');
    expect(event.en).toContain('do nothing on it before the owner says yes');
    expect(event.ka).toContain('ეს რჩევაა და არა უარი');
    expect(event.ru).toContain('это совет, а не отказ');
    expect(event.es).toContain('es una sugerencia, no un rechazo');
  });

  it('still says what happened: the mediator declined', () => {
    expect(event.en).toContain('declined the introduction');
  });

  it('a decline with no words carries no such rule', () => {
    const bare = introOutcomeEvent('თიკო', false, 'kept_by_mediator', 'ბესო', true, {
      answer: null,
    });
    expect(bare.en).not.toContain('suggests someone else');
  });

  it('is not decided by a word list', () => {
    const intro = readFileSync(join(__dirname, '..', 'introduction.service.ts'), 'utf8');
    expect(intro).not.toContain('refersSomebody');
  });
});
