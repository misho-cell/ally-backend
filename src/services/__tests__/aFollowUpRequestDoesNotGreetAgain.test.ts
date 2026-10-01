/**
 * Plate v301 G7 (the tester's 992, 29582): a request written into the
 * mediator's ask thread greeted again and retold the need already on screen.
 */
import { incomingRequestFollowUp, incomingRequestOpening } from '../introOpening';

const LANGUAGES = ['ka', 'en', 'ru', 'es'] as const;

describe('a request that continues the conversation', () => {
  it.each(LANGUAGES)('%s opens without a greeting', (language) => {
    const first = incomingRequestOpening(language, 'Giorgi', 'Nino', 'need a lawyer', false);
    const follow = incomingRequestFollowUp(language, 'Giorgi', 'Nino', false);

    expect(first).toMatch(/^(გამარჯობა|Hello|Привет|¡Hola)/);
    expect(follow).not.toMatch(/გამარჯობა|Hello|Привет|Hola/);
  });

  it.each(LANGUAGES)('%s names who asks for whom, and nothing else', (language) => {
    const follow = incomingRequestFollowUp(language, 'Giorgi', 'Nino', false);

    expect(follow).toContain('Giorgi');
    expect(follow).not.toContain('need a lawyer');
  });

  it('asks the target directly when the mediator is the target', () => {
    expect(incomingRequestFollowUp('en', 'Giorgi', 'Nino', true)).toBe(
      '**Giorgi** would now like to meet you directly. Will you say yes?',
    );
  });
});
