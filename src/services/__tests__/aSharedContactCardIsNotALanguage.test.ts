import { carriesLanguage, detectRunLanguage, languageOfConversation } from '../runLanguage';

/**
 * Tester's real-user watch, 30 Oct (thread 63371): a Georgian helper shared
 * phonebook cards in Latin letters, and the server's own lines turned English
 * mid-conversation. A shared card says nothing about its sender's language.
 */
const CARD = '[Name] Levan Test gamtsvaneba\n[Mobile] +995 599 00 00 00';

describe('a shared contact card', () => {
  it('carries no language of its own', () => {
    expect(carriesLanguage(CARD)).toBe(false);
  });

  it('keeps the conversation’s language', () => {
    expect(languageOfConversation(CARD, ['ეგ მერიის თანამშრომელია. სხვებს მოგწერ'])).toBe('ka');
  });

  it('does not outvote the words written around it', () => {
    expect(detectRunLanguage(`ეს ნომერი გამოგადგება\n${CARD}`)).toBe('ka');
  });

  it('leaves a sentence that only mentions a name in brackets alone', () => {
    expect(carriesLanguage('Please ask [Name] whether he knows a good accountant')).toBe(true);
  });
});
