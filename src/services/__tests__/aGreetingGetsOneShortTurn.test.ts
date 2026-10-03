/**
 * Board #378: a plain greeting took 37 seconds to the first word. A message
 * that is only a greeting now gets one short turn with no tools; this is the
 * test of what counts as only a greeting.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  BLANK_RETRY_NOTE,
  GREETING_MAX_TOKENS,
  GREETING_TURN_NOTE,
  isBareGreeting,
} from '../greetingTurn';

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

  /**
   * Tester 1071/1072: on prompt v3 the tool-less greeting turn came back
   * blank 52 times out of 54 blanks. The turn now says what it is.
   */
  it('tells the model the turn has no tools and only needs a greeting back', () => {
    expect(GREETING_TURN_NOTE).toMatch(/no tools/);
    expect(GREETING_TURN_NOTE).toMatch(/greet/i);
    const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
    expect(chat).toContain('greetingOnly ? GREETING_TURN_NOTE : otherTap ? OTHER_CHOICE_TURN_NOTE');
  });

  /** Task 695 (31886): the re-ask after a blank says the first try was empty. */
  it('re-asks a blank first answer with a note, not the identical request', () => {
    expect(BLANK_RETRY_NOTE).toMatch(/returned nothing/);
    const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
    expect(chat).toContain('systemPrompt + BLANK_RETRY_NOTE');
  });
});
