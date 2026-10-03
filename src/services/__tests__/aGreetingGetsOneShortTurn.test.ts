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

  it('greets by name in the reply’s own script, and asks an empty account to import contacts', () => {
    expect(greetingText(greetingName('თორნიკე აბულაძე', 'ka'), true, 'ka')).toBe(
      'გამარჯობა, თორნიკე! რით დაგეხმარო?',
    );
    expect(greetingName('Tornike', 'ka')).toBeNull();
    expect(greetingText(null, true, 'en')).toBe('Hello! How can I help?');
    expect(greetingText(null, false, 'ka')).toContain('კონტაქტები აპში შემოიტანე');
  });

  /** Task 695 (31886): the re-ask after a blank says the first try was empty. */
  it('re-asks a blank first answer with a note, not the identical request', () => {
    expect(BLANK_RETRY_NOTE).toMatch(/returned nothing/);
    const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
    expect(chat).toContain('systemPrompt + BLANK_RETRY_NOTE');
  });
});
