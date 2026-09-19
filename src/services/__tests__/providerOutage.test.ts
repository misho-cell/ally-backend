import { isProviderRefusal } from '../providerOutage';
import { RUN_STRINGS, RunLanguage } from '../runLanguage';

/**
 * Ticket 20 row 217 — „please try again" into a wall.
 *
 * 18 September, 20:29 to past 21:12. The model provider's credit balance ran
 * out and every run in the product died on its first call:
 *
 *   400 invalid_request_error
 *   „Your credit balance is too low to access the Anthropic API."
 *
 * Six of the seat's runs in a row, three to four seconds each, zero tool
 * calls, the token balance unmoved through all of them. „What is 2 plus 2"
 * failed exactly like the rest, which is what proved it was not the question —
 * and the seat withdrew a row they had filed twenty minutes earlier once they
 * ran that control.
 *
 * All six told the owner „Please try again." Not one retry could have worked.
 */
const LANGUAGES: readonly RunLanguage[] = ['ka', 'en', 'ru', 'es'];

describe('recognising a refusal by the model provider', () => {
  it('catches the exact 400 that took the product down', () => {
    const real = Object.assign(new Error('400 Your credit balance is too low to access the API'), {
      status: 400,
    });
    expect(isProviderRefusal(real)).toBe(true);
  });

  it('catches the statuses that mean „not you, and not now"', () => {
    for (const status of [401, 402, 403, 429, 500, 502, 503, 529]) {
      expect(isProviderRefusal(Object.assign(new Error('nope'), { status }))).toBe(true);
    }
  });

  /**
   * A 400 from this API normally means WE sent something malformed. That is a
   * defect to fix, not an outage to wait out, and calling it „the service is
   * unavailable" would hide a real bug behind a shrug.
   */
  it('does NOT treat an ordinary 400 as an outage — that one is our bug', () => {
    const ourBug = Object.assign(new Error('messages.0.content: expected array'), { status: 400 });
    expect(isProviderRefusal(ourBug)).toBe(false);
  });

  it('is not fooled by anything that is not an error object', () => {
    expect(isProviderRefusal(null)).toBe(false);
    expect(isProviderRefusal(undefined)).toBe(false);
    expect(isProviderRefusal('credit balance is too low')).toBe(false);
    expect(isProviderRefusal(429)).toBe(false);
    expect(isProviderRefusal({})).toBe(false);
  });

  it('treats a run that simply crashed as a crash, not as an outage', () => {
    expect(isProviderRefusal(new Error('RUN_HARD_TIMEOUT'))).toBe(false);
    expect(isProviderRefusal(new TypeError('cannot read properties of undefined'))).toBe(false);
  });
});

describe('what the owner is told when the provider refuses', () => {
  it('exists in all four languages', () => {
    for (const language of LANGUAGES) {
      expect(RUN_STRINGS[language].serviceUnavailable.length).toBeGreaterThan(30);
    }
  });

  it('never tells them it is about money — our billing is not theirs to carry', () => {
    for (const language of LANGUAGES) {
      const line = RUN_STRINGS[language].serviceUnavailable;
      expect(line).not.toMatch(/credit|balance|billing|ბალანს|კრედიტ|баланс|кредит|saldo|crédito/i);
    }
  });

  it('does not ask them to try again, which is the whole point', () => {
    const tryAgain: Record<RunLanguage, RegExp> = {
      ka: /სცადე თავიდან/,
      en: /try again/i,
      ru: /попробуй ещё раз/i,
      es: /inténtalo de nuevo/i,
    };
    for (const language of LANGUAGES) {
      expect(RUN_STRINGS[language].serviceUnavailable).not.toMatch(tryAgain[language]);
      // The line it replaces DOES say it — that is what made the change worth
      // making, and if that ever stops being true this test should be re-read.
      expect(RUN_STRINGS[language].runDied).toMatch(tryAgain[language]);
    }
  });

  it('says it is not the owner’s fault, and that the work resumes', () => {
    const notYou: Record<RunLanguage, RegExp> = {
      ka: /შენი ბრალი არ არის/,
      en: /not on you/i,
      ru: /не на твоей/i,
      es: /no tuya/i,
    };
    for (const language of LANGUAGES) {
      expect(RUN_STRINGS[language].serviceUnavailable).toMatch(notYou[language]);
    }
  });

  it('carries no Georgian outside the Georgian one', () => {
    for (const language of ['en', 'ru', 'es'] as const) {
      expect(RUN_STRINGS[language].serviceUnavailable).not.toMatch(/[Ⴀ-ჿ]/);
    }
  });
});

/**
 * Row 217, second half — the BADGE must not contradict the message under it.
 *
 * During the outage the thread carried „Hit a snag — try again" over a message
 * saying, correctly, that trying again would not help. Two sentences on one
 * screen telling a person opposite things, and the one in the smaller type was
 * the wrong one.
 */
describe('the badge on a thread whose provider refused it', () => {
  const tryAgain: Record<RunLanguage, RegExp> = {
    ka: /სცადე თავიდან/,
    en: /try again/i,
    ru: /попробуй ещё раз/i,
    es: /inténtalo de nuevo/i,
  };

  it('exists in all four languages and says nothing about trying again', () => {
    for (const language of LANGUAGES) {
      const badge = RUN_STRINGS[language].statusLines.unavailable;
      expect(badge.length).toBeGreaterThan(10);
      expect(badge).not.toMatch(tryAgain[language]);
    }
  });

  it('is a DIFFERENT badge from the ordinary failure, which still says it', () => {
    for (const language of LANGUAGES) {
      const { unavailable, failed } = RUN_STRINGS[language].statusLines;
      expect(unavailable).not.toBe(failed);
      // The line it stands beside is unchanged: a run that simply broke is
      // still worth retrying, and that is most of them.
      expect(failed).toMatch(tryAgain[language]);
    }
  });

  it('never mentions money either — the badge is read by the same person', () => {
    for (const language of LANGUAGES) {
      expect(RUN_STRINGS[language].statusLines.unavailable).not.toMatch(
        /credit|balance|billing|ბალანს|баланс|saldo/i,
      );
    }
  });

  it('carries no Georgian outside the Georgian one', () => {
    for (const language of ['en', 'ru', 'es'] as const) {
      expect(RUN_STRINGS[language].statusLines.unavailable).not.toMatch(/[Ⴀ-ჿ]/);
    }
  });
});
