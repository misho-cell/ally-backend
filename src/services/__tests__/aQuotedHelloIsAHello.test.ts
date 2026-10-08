import { isBareGreeting, unquoted } from '../greetingTurn';
import { isFarewell, isPlainThanks, isSmallTalk, isToolFreeSmallTalk } from '../smallTalk';

/**
 * 3202 (Ninia's phone, 8 Oct 07:58Z): „გამარჯობა with an opening quote was not
 * read as a greeting; the run called check_my_inbox and the server listed ten
 * waiting goals under the hello. Quote marks around the line are not words.
 */
describe('a hello in quotes is still a hello', () => {
  it.each(['„გამარჯობა', '„გამარჯობა“', '"hello"', '«привет»', "'hi'"])('%s', (line) => {
    expect(isBareGreeting(line)).toBe(true);
    expect(isToolFreeSmallTalk(line)).toBe(true);
  });

  it('thanks and goodbye in quotes too', () => {
    expect(isPlainThanks('„მადლობა“')).toBe(true);
    expect(isFarewell('„ნახვამდის“')).toBe(true);
    expect(isSmallTalk('"how are you?"')).toBe(true);
  });

  it('only the wrapping quotes go; a need in quotes is still a need', () => {
    expect(unquoted('„ვინ იცნობს „კარგ“ ექიმს?“')).toBe('ვინ იცნობს „კარგ“ ექიმს?');
    expect(isSmallTalk('„მჭირდება ვეტერინარი“')).toBe(false);
  });
});
