import { isBareGreeting } from '../greetingTurn';
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

  it('leaves a plain hello as it is, with no import line (#7789)', () => {
    expect(greetingText('ნინო', true, 'ka', 'გამარჯობა', true)).toBe(
      'გამარჯობა, ნინო! რით დაგეხმარო?',
    );
    expect(greetingText(null, false, 'ka', 'დილა მშვიდობისა', true)).not.toContain(
      'კონტაქტები აპში შემოიტანე',
    );
  });

  it('reads only a time-of-day greeting', () => {
    expect(timeOfDayGreeting('დილა   მშვიდობისა')).toBe('დილა მშვიდობისა');
    expect(timeOfDayGreeting('გამარჯობა')).toBeNull();
  });
});

/**
 * The tester's 56030: „დილამშვიდობის" (no space, final „ა" missing) was not
 * recognized; the full model ran and copied the typo. It is a greeting, and
 * the same words come back spelled right.
 */
describe('a time-of-day greeting typed without care', () => {
  it.each(['დილამშვიდობის', 'დილა მშვიდობის!', 'საღამომშვიდობისა', 'დილა  მშვიდობისა'])(
    '„%s" is a bare greeting',
    (line) => {
      expect(isBareGreeting(line)).toBe(true);
    },
  );

  it('is echoed spelled right', () => {
    expect(timeOfDayGreeting('დილამშვიდობის')).toBe('დილა მშვიდობისა');
    expect(timeOfDayGreeting('საღამო მშვიდობის!')).toBe('საღამო მშვიდობისა');
    expect(timeOfDayGreeting('დილა მშვიდობისა!')).toBe('დილა მშვიდობისა');
  });

  it('leaves other words alone', () => {
    expect(isBareGreeting('დილამშვიდობის, ნოტარიუსი მომიძებნე')).toBe(false);
    expect(timeOfDayGreeting('Good morning!')).toBe('Good morning');
  });
});
