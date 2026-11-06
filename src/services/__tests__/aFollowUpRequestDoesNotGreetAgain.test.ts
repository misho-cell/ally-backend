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

    // #6351: the Georgian first request opens with „დამიკავშირდა" (Giorgi's wording).
    expect(first).toMatch(/^(გამარჯობა|დამიკავშირდა|Hello|Привет|¡Hola)/);
    expect(follow).not.toMatch(/გამარჯობა|Hello|Привет|Hola/);
  });

  it.each(LANGUAGES)('%s names who asks for whom, and nothing else', (language) => {
    const follow = incomingRequestFollowUp(language, 'Giorgi', 'Nino', false);

    // #6351: the Georgian request writes a Latin name in Georgian script.
    expect(follow).toMatch(language === 'ka' ? /გიორგ/u : /Giorgi/u);
    expect(follow).not.toContain('need a lawyer');
  });

  it('asks the target directly when the mediator is the target', () => {
    expect(incomingRequestFollowUp('en', 'Giorgi', 'Nino', true)).toBe(
      '**Giorgi** would now like to meet you directly. Will you say yes?',
    );
  });
});

/**
 * Giorgi's review (case 46): Iro named Omiko herself, and the request in the
 * same thread asked her whether she knows Omiko.
 */
describe('a follow-up request to the go-between who named the person', () => {
  it('asks her to connect, never whether she knows them', () => {
    const follow = incomingRequestFollowUp('ka', 'ლია', 'ომიკო', false);
    expect(follow).toBe('ლია ახლა გთხოვს, დააკავშირო ომიკოსთან. დაეხმარები? 🤝');
    expect(follow).not.toContain('იცნობ');
  });
});
