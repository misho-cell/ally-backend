import { greetingText, MIRRORED_GREETING_ON, timeOfDayGreeting } from '../serverGreeting';

/** 2114 (box 54162): „დილა მშვიდობისა" was answered „გამარჯობა". */
describe('a time-of-day greeting is answered in kind', () => {
  it('is ON since Misho’s yes (§132): his own words come back by default', () => {
    expect(MIRRORED_GREETING_ON).toBe(true);
    expect(greetingText('ნინო', true, 'ka', 'დილა მშვიდობისა')).toBe(
      'დილა მშვიდობისა, ნინო! რით დაგეხმარო?',
    );
  });

  it('switched off, every hello reads as it did', () => {
    expect(greetingText('ნინო', true, 'ka', 'დილა მშვიდობისა', false)).toBe(
      'გამარჯობა, ნინო! რით დაგეხმარო?',
    );
  });

  it('when ON, answers with the person’s own words in each language', () => {
    expect(greetingText('ნინო', true, 'ka', 'დილა მშვიდობისა', true)).toBe(
      'დილა მშვიდობისა, ნინო! რით დაგეხმარო?',
    );
    expect(greetingText(null, true, 'ka', 'საღამო მშვიდობისა!', true)).toBe(
      'საღამო მშვიდობისა! რით დაგეხმარო?',
    );
    expect(greetingText('Ana', true, 'en', 'good morning', true)).toBe(
      'Good morning, Ana! How can I help?',
    );
    expect(greetingText('Ana', true, 'es', 'buenos días', true)).toBe(
      '¡Buenos días, Ana! ¿En qué te ayudo?',
    );
  });

  it('leaves a plain hello and the import line as they are', () => {
    expect(greetingText('ნინო', true, 'ka', 'გამარჯობა', true)).toBe(
      'გამარჯობა, ნინო! რით დაგეხმარო?',
    );
    expect(greetingText(null, false, 'ka', 'დილა მშვიდობისა', true)).toContain(
      'კონტაქტები აპში შემოიტანე',
    );
  });

  it('reads only a time-of-day greeting', () => {
    expect(timeOfDayGreeting('დილა   მშვიდობისა')).toBe('დილა მშვიდობისა');
    expect(timeOfDayGreeting('გამარჯობა')).toBeNull();
  });
});
