/**
 * Board #378: a plain greeting took 37 seconds to the first word. A message
 * that is only a greeting now gets one short turn with no tools; this is the
 * test of what counts as only a greeting.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { BLANK_RETRY_NOTE, GREETING_MAX_TOKENS, isBareGreeting } from '../greetingTurn';
import { greetingName, greetingText } from '../serverGreeting';

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
    // The tester's 1114 (34593, 34597).
    'გამარჯობა, როგორ ხარ?',
    'დილა მშვიდობისა',
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

  /** The tester's 1114 (D617): a hello gets a hello at once, written by the server. */
  it('is answered by the server before any model turn', () => {
    const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
    const greet = chat.indexOf('if (greetingOnly) {');
    const firstCall = chat.indexOf(
      'let response = await callClaude(messages, systemPrompt + shortTurnNote',
    );
    expect(greet).toBeGreaterThan(-1);
    expect(firstCall).toBeGreaterThan(greet);
    expect(chat.slice(greet, greet + 600)).toContain('clearInterval(heartbeat);');
  });

  it('greets by first name as saved, answers „how are you", and asks an empty account to import', () => {
    expect(greetingText(greetingName('თორნიკე აბულაძე'), true, 'ka')).toBe(
      'გამარჯობა, თორნიკე! რით დაგეხმარო?',
    );
    // The tester's 1117: the founder's name is saved in Latin letters.
    expect(greetingText(greetingName('Tornike'), true, 'ka')).toBe(
      'გამარჯობა, Tornike! რით დაგეხმარო?',
    );
    expect(greetingName('+995 555')).toBeNull();
    expect(greetingText(null, true, 'ka', 'გამარჯობა, როგორ ხარ?')).toBe(
      'გამარჯობა! კარგად ვარ, მადლობა. რით დაგეხმარო?',
    );
    expect(greetingText(null, true, 'en')).toBe('Hello! How can I help?');
    expect(greetingText(null, false, 'ka')).toContain('კონტაქტები აპში შემოიტანე');
  });

  it('skips the reply check on the server’s own sentence', () => {
    const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
    expect(chat).toContain('answeredBy === SERVER_GREETING_AUTHOR');
  });

  /** Task 695 (31886): the re-ask after a blank says the first try was empty. */
  it('re-asks a blank first answer with a note, not the identical request', () => {
    expect(BLANK_RETRY_NOTE).toMatch(/returned nothing/);
    const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
    expect(chat).toContain('systemPrompt + BLANK_RETRY_NOTE');
  });
});
