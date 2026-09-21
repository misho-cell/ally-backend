import {
  RUN_STRINGS,
  detectRunLanguage,
  RunLanguage,
  answerHeldNoTokens,
  messageHeldNoTokens,
} from '../runLanguage';
import { scrubMechanicalForStorage } from '../privacyScrub';

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

  /**
   * IT USED TO PROMISE THAT THE WORK WOULD CONTINUE, and the comment under
   * this test said why: „the owner must be told the work resumes, because on
   * the account this happened to it did not."
   *
   * Row 221, 21 September: the seat established that a refused message creates
   * no goal, so nothing resumes on its own — the person has to send it again.
   * The badge said „top up and I will carry on" while the message directly
   * under it said „send it again and I will pick it up". Two promises about
   * one moment, and the comfortable one was the false one.
   *
   * „Out of tokens" alone still reads as an ending, so the second half stays —
   * it just has to be the half that is true.
   */
  it('says the same two things in every language: it ran out, and to send it again', () => {
    const sendItAgain: Record<RunLanguage, RegExp> = {
      ka: /ხელახლა გამომიგზავნე/,
      en: /send it again/i,
      ru: /отправь ещё раз/i,
      es: /envíalo otra vez/i,
    };
    for (const language of ['ka', 'en', 'ru', 'es'] as const) {
      expect(RUN_STRINGS[language].statusLines.needs_topup).toMatch(sendItAgain[language]);
    }
  });

  /**
   * And the badge and the sentence beneath it must not disagree again.
   *
   * The distinction that matters is not the word „continue" — the MESSAGE says
   * „send it again and I will pick it up", and that is true, because the
   * continuing is conditional on the resend. What was false was the badge
   * promising to carry on with no resend at all. So the test is that both ask
   * for the same action, not that neither mentions continuing.
   */
  it('asks for the same action as the message it sits above', () => {
    const sendItAgain: Record<RunLanguage, RegExp> = {
      ka: /ხელახლა გამომიგზავნე/,
      en: /send it again/i,
      ru: /отправь ещё раз/i,
      es: /envíalo otra vez/i,
    };
    for (const language of ['ka', 'en', 'ru', 'es'] as const) {
      expect(RUN_STRINGS[language].statusLines.needs_topup).toMatch(sendItAgain[language]);
      expect(messageHeldNoTokens(language)).toMatch(sendItAgain[language]);
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

/**
 * Row 157, the engine's half, 19 September.
 *
 * The seat's Test 1 spent its own allowance mid-session and two goals stopped
 * for money. The status line above the thread had four languages; the sentence
 * the engine writes INTO the thread had one, hardcoded in taskEngine — so the
 * English conversation those goals lived in was going to be told in Georgian
 * that its work had stopped and that it should pay.
 *
 * The worst possible sentence to get wrong: it is the moment the product stops
 * doing what it promised and asks for money, and somebody who cannot read it
 * is left with a goal that simply went quiet.
 */
describe('the line a goal writes when its own wake finds the wallet empty', () => {
  it('exists in every language and says both halves: stopped, and will resume', () => {
    const resumes: Record<RunLanguage, RegExp> = {
      ka: /გავაგრძელებ/,
      en: /carry on/i,
      ru: /продолжу/i,
      es: /continuaré/i,
    };
    for (const language of ['ka', 'en', 'ru', 'es'] as const) {
      const line = RUN_STRINGS[language].goalPausedNoTokens;
      // Not „it is non-empty": both facts have to be in it. „Tokens ran out"
      // on its own reads as an ending, which is the thing this is not.
      expect(line.length).toBeGreaterThan(30);
      expect(line).toMatch(resumes[language]);
    }
  });

  it('carries no Georgian in the non-Georgian lines', () => {
    for (const language of ['en', 'ru', 'es'] as const) {
      expect(RUN_STRINGS[language].goalPausedNoTokens).not.toMatch(/[Ⴀ-ჿ]/);
    }
  });

  it('is not the status line — the badge and the message are different jobs', () => {
    // The badge is chrome above the thread; this is a message inside it, and
    // the two were different wordings of the same fact even in Georgian.
    for (const language of ['ka', 'en', 'ru', 'es'] as const) {
      expect(RUN_STRINGS[language].goalPausedNoTokens).not.toBe(
        RUN_STRINGS[language].statusLines.needs_topup,
      );
    }
  });
});

/**
 * The seat's 290, and it is the hardest sentence of the day: a user asked for
 * an introduction, it WORKED — two people helped, the target accepted and
 * offered his week — and the only thing the product has ever told him about it
 * is that he owes money.
 *
 * Goal 6205. The answer arrived at 19:10:21, the wake that would have reported
 * it found an empty wallet, and the wallet line took the turn. Neither row 157
 * nor row 210 would have caught it: each is right on its own, and this is what
 * they do to each other.
 *
 * Nothing is lost — sweepUnwokenAnswers marks an ask delivered only on 'woken',
 * so the answer is re-offered every sweep. But „held" and „nothing happened"
 * are different facts and the person is owed the first one.
 */
describe('the pause line, when the wake it refused was carrying news', () => {
  it('names who answered, in every language', () => {
    for (const language of ['ka', 'en', 'ru', 'es'] as const) {
      expect(answerHeldNoTokens(language, 'Netai Test 3')).toContain('Netai Test 3');
    }
  });

  it('says the news is held rather than that the work stopped', () => {
    // The whole point: „paused, top up" is what the owner got, and it reads as
    // „nothing happened". This must not.
    const held: Record<RunLanguage, RegExp> = {
      ka: /არაფერი დაკარგულა/,
      en: /nothing is lost/i,
      ru: /ничего не потеряно/i,
      es: /no se ha perdido nada/i,
    };
    for (const language of ['ka', 'en', 'ru', 'es'] as const) {
      const line = answerHeldNoTokens(language, 'Nino');
      expect(line).toMatch(held[language]);
      expect(line).not.toBe(RUN_STRINGS[language].goalPausedNoTokens);
    }
  });

  it('carries no Georgian in the non-Georgian lines', () => {
    for (const language of ['en', 'ru', 'es'] as const) {
      expect(answerHeldNoTokens(language, 'Nino')).not.toMatch(/[Ⴀ-ჿ]/);
    }
  });

  it('does not quote the answer itself — that needs a run this branch cannot make', () => {
    // A name turns an invoice back into news. The answer's wording is the
    // model's job and there is no model in this path; composing it here would
    // be the server writing the owner's update by hand.
    const line = answerHeldNoTokens('en', 'Nino');
    expect(line.length).toBeLessThan(200);
  });
});

/**
 * Eighteen copies of one sentence, one every five minutes, on the screen of
 * somebody who could not pay. The seat counted them by DOM position.
 *
 * The sentence is right and the guard against repeating it existed. What the
 * guard compared was the text handed to it; what the database holds is that
 * text after `scrubMechanicalForStorage`, which `saveThreadMessage` applies to
 * every assistant message. This line contains an em dash and the scrub rewrites
 * it to a comma — so the two strings could never be equal, and a check that can
 * never pass is not a check.
 *
 * It is the same species the seat named an hour earlier about a different bug:
 * a guard that only runs when it is not needed. This one never ran at all.
 *
 * The wake floor is what made it visible, and that is worth saying plainly: a
 * goal that could not proceed now wakes reliably, so a line written on every
 * wake gets written reliably too. The fix removed a silence and exposed a
 * repetition that was always latent.
 */
describe('the held-answer line survives the storage scrub it is compared against', () => {
  it('is changed by the scrub, which is the whole reason the guard failed', () => {
    const line = answerHeldNoTokens('en', 'Netai Test 3');
    const stored = scrubMechanicalForStorage(line);
    // If this ever stops being true the bug is gone for a different reason,
    // and this test should be read again rather than deleted.
    expect(stored).not.toBe(line);
    expect(line).toContain('—');
    expect(stored).not.toContain('—');
  });

  it('matches the exact text the seat found thirteen times in one thread', () => {
    // Copied from `conversations` on thread 18745, not retyped from the source.
    expect(scrubMechanicalForStorage(answerHeldNoTokens('en', 'Netai Test 3'))).toBe(
      'Netai Test 3 has answered. I cannot write up their reply until the tokens are topped up, nothing is lost, it is waiting.',
    );
  });

  it('is scrub-stable, so one pass is all the comparison needs', () => {
    // The guard scrubs once and compares. If the scrub were not idempotent the
    // stored value would drift from it on every write.
    for (const language of ['ka', 'en', 'ru', 'es'] as const) {
      const once = scrubMechanicalForStorage(answerHeldNoTokens(language, 'Nino'));
      expect(scrubMechanicalForStorage(once)).toBe(once);
    }
  });
});

/**
 * Row 217 — the completion of Lika's P0, and the part nobody built.
 *
 * Her fix stopped the refusal throwing her sentence away: `keepUserMessage`
 * stores it and it renders. Nothing was ever built to come back for it.
 *
 * Goal 6271, thread 18811. „go ahead", eight characters, stored 18:18:01 on a
 * negative balance. Topped up at 21:04. Six hours later the owner asked „are
 * you still there?" and was told „I'm just waiting on your go-ahead" — with
 * the go-ahead in that same conversation, on the screen of the person being
 * told it had not arrived.
 *
 * The badge above it said „top up and I will carry on". It did not carry on
 * and it could not, so the badge was a promise. This line is the truth beside
 * it: the words are kept, and they have to be sent again.
 */
describe('what the owner is told about the message the wall refused', () => {
  it('exists in every language and says both halves: kept, and send it again', () => {
    const again: Record<RunLanguage, RegExp> = {
      ka: /ხელახლა/,
      en: /send it again/i,
      ru: /отправь ещё раз/i,
      es: /env[íi]alo otra vez/i,
    };
    for (const language of ['ka', 'en', 'ru', 'es'] as const) {
      const line = messageHeldNoTokens(language);
      // „I kept it" on its own leaves somebody waiting for something that is
      // never coming. The instruction is the whole point.
      expect(line).toMatch(again[language]);
      expect(line.length).toBeGreaterThan(40);
    }
  });

  it('does not promise to carry on by itself, which is what the badge does', () => {
    // The badge says „top up and I will carry on" — true of the GOAL, false of
    // this message. The two must not say the same thing.
    for (const language of ['ka', 'en', 'ru', 'es'] as const) {
      expect(messageHeldNoTokens(language)).not.toBe(RUN_STRINGS[language].statusLines.needs_topup);
    }
  });

  it('carries no Georgian in the non-Georgian lines', () => {
    for (const language of ['en', 'ru', 'es'] as const) {
      expect(messageHeldNoTokens(language)).not.toMatch(/[Ⴀ-ჿ]/);
    }
  });
});
