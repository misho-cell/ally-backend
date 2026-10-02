/**
 * Board #378: a plain greeting took 37 seconds to the first word. A message
 * that is only a greeting now gets one short turn with no tools; this is the
 * test of what counts as only a greeting.
 */
import { GREETING_MAX_TOKENS, isBareGreeting } from '../greetingTurn';

describe('isBareGreeting', () => {
  it.each([
    'გამარჯობა',
    'გამარჯობა!',
    '  სალამი 👋',
    'Hello!',
    'hi',
    'Good morning.',
    'привет',
    'Здравствуйте!',
  ])('treats %p as only a greeting', (text: string) => {
    expect(isBareGreeting(text)).toBe(true);
  });

  it.each([
    'გამარჯობა, მჭირდება იურისტი',
    'hello, who knows a dentist?',
    'hi there can you help',
    'მინდა გამარჯობა ვუთხრა გიორგის',
    '',
  ])('keeps the full turn for %p', (text: string) => {
    expect(isBareGreeting(text)).toBe(false);
  });

  it('is false for a missing message', () => {
    expect(isBareGreeting(null)).toBe(false);
    expect(isBareGreeting(undefined)).toBe(false);
  });

  it('leaves room for a short reply, not a long one', () => {
    expect(GREETING_MAX_TOKENS).toBeGreaterThanOrEqual(200);
    expect(GREETING_MAX_TOKENS).toBeLessThanOrEqual(500);
  });
});
