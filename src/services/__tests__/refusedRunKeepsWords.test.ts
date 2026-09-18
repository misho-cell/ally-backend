import { RUN_STRINGS, detectRunLanguage, RunLanguage } from '../runLanguage';

/**
 * P0, 18 September — at zero tokens the owner's typed goal was thrown away, and
 * the product then told them it was finished.
 *
 * Lika, on Ninia's account 165699, typed a goal on an exhausted balance twice
 * inside five minutes. Both times she got a chat with a real title and a top-up
 * card; both times a reload showed the chat EMPTY and marked finished. The seat
 * checked it against the admin: zero goals created on that account that day, no
 * messages on the thread. The title existed, the chat existed, her sentence did
 * not.
 *
 * The cause was the ORDER in POST /threads/:id/messages. The provisional title
 * is written from the message, the wallet is checked next, and the 402 returned
 * before any other write — so the one part of the exchange that was hers was
 * the only part not stored. The thread then read „finished" because it is
 * created with the default done status and no goal ever existed to contradict
 * it.
 *
 * Three separate faults were tangled in one return, and only the first was
 * intended: refuse the run, lose the words, claim success. This file holds the
 * two that were never meant to be there.
 */
describe('a run refused for an empty wallet', () => {
  it('has a status line for it, in every language, that does not say finished', () => {
    // The thread cannot be left reading „done". It also cannot borrow
    // `needs_you` silently — the owner needs to know it is money and not an
    // unanswered question.
    for (const language of ['ka', 'en', 'ru', 'es'] as const) {
      const line = RUN_STRINGS[language].statusLines.needs_topup;
      expect(line.length).toBeGreaterThan(10);
      expect(line).not.toBe(RUN_STRINGS[language].statusLines.needs_you);
      expect(line).not.toBe(RUN_STRINGS[language].statusLines.failed);
    }
  });

  it('says the same two things in every language: it ran out, and it will continue', () => {
    // „Out of tokens" alone reads as an ending. The owner must be told the work
    // resumes, because on the account this happened to it did not.
    const resumes: Record<RunLanguage, RegExp> = {
      ka: /გავაგრძელებ/,
      en: /carry on/i,
      ru: /продолжу/i,
      es: /sigo/i,
    };
    for (const language of ['ka', 'en', 'ru', 'es'] as const) {
      expect(RUN_STRINGS[language].statusLines.needs_topup).toMatch(resumes[language]);
    }
  });

  it('picks the line from the message that was refused, not from a default', () => {
    // The refusal happens before any run, so there is no run language yet —
    // the message itself is the only evidence of how this person writes.
    expect(detectRunLanguage('I need a good dentist in Tbilisi')).toBe('en');
    expect(detectRunLanguage('მჭირდება კარგი სტომატოლოგი')).toBe('ka');
    expect(RUN_STRINGS[detectRunLanguage('I need a dentist')].statusLines.needs_topup).toContain(
      'top up',
    );
  });

  it('carries no Georgian in the non-Georgian lines', () => {
    // The same rule runLanguage.ts was written for: an English thread does not
    // carry Georgian chrome, and a status line is chrome.
    for (const language of ['en', 'ru', 'es'] as const) {
      expect(RUN_STRINGS[language].statusLines.needs_topup).not.toMatch(/[Ⴀ-ჿ]/);
    }
  });
});
