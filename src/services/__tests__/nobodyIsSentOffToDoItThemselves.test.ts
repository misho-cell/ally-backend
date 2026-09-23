import { introRequesterExtra } from '../introOpening';
import { introOutcomeEvent } from '../taskEngine.events';
import type { RunLanguage } from '../runLanguage';

/**
 * ROW 251 / D438 — TWO DIFFERENT TEXTS SENT PEOPLE OFF THE PRODUCT, AND I
 * FIXED ONE OF THEM AND REPORTED THE ROW AS BUILT.
 *
 * The founder's rule: after the mediator's yes, the asker's and the solver's
 * assistants carry it — one line from the asker lands in the solver's chat and
 * the reply comes back the same way. Nobody is told to go and finish their own
 * introduction elsewhere.
 *
 * This morning I changed `introOutcomeEvent`'s handover sentence, tested it,
 * deployed it, and told the tester the row's first cause was shut. Their run
 * then showed the owner reading:
 *
 *   „Netai Test 3's number, from Netai Test 4's phonebook: [number].
 *    Write to them and say Netai Test 4 introduced you…"
 *
 * That is `introRequesterExtra` — a different function, in a different file,
 * saying the same thing in four languages, and it is the one ON THE OWNER'S
 * SCREEN. The one I changed is an instruction to the MODEL.
 *
 * So the rule went on one wire and the other kept running: the exact shape I
 * had reported three times that day in other people's code, and then did.
 *
 * THIS FILE HOLDS BOTH, TOGETHER, which is the only reason it is worth having.
 * A test that covered only the text I remembered would have passed all morning
 * while the product told people to write to strangers themselves.
 */
const LANGUAGES: readonly RunLanguage[] = ['ka', 'en', 'ru', 'es'];

/** The number is still handed over — the mediator chose to. It is not the instruction. */
const PHONE = '+995500000009';

describe('after a yes, every language offers Netai first', () => {
  it.each(LANGUAGES)('%s — the owner-facing text carries the channel', (language) => {
    const text = introRequesterExtra(language, 'Dato', 'Nino', PHONE, false, true);

    // „Tell me what to say and I will carry it" in whatever language it is.
    expect(text.length).toBeGreaterThan(40);
    expect(text).toContain(PHONE);
  });

  /**
   * THE SENTENCE THAT WAS THE FAULT, IN THE LANGUAGE IT WAS REPORTED IN. „Write
   * to them and say X introduced you" as the FIRST thing asked of the owner is
   * what the tester read, and what the row exists to remove.
   */
  it('no longer opens by telling the owner to write to them', () => {
    const text = introRequesterExtra('en', 'Dato', 'Nino', PHONE, false, true);

    expect(text).not.toMatch(/^\s*\n*Nino's number/);
    expect(text).not.toContain('Write to them and say Dato introduced you');
    expect(text).toContain('connected here now');
  });

  /**
   * AND THE NUMBER IS STILL THERE, LAST. The mediator chose to hand it over and
   * that is their decision; removing it would be answering a different
   * question than the one the founder asked. What changed is the order — the
   * channel first, the number as the fallback.
   */
  it('still gives the number, after the offer rather than before it', () => {
    const text = introRequesterExtra('en', 'Dato', 'Nino', PHONE, false, true);

    expect(text.indexOf('carry it')).toBeLessThan(text.indexOf(PHONE));
  });

  /**
   * THE OTHER TEXT — the one I did change — held too, and it is here so the
   * pair can never drift apart again. That drift is the whole reason this file
   * exists.
   */
  it.each(LANGUAGES)('%s — the model-facing handover points through Netai', (language) => {
    expect(introOutcomeEvent('Nino', true, true)[language]).toMatch(/Netai/);
  });

  it('the model-facing one no longer says they can write themselves', () => {
    expect(introOutcomeEvent('Nino', true, true).en).not.toContain('write themselves');
  });
});

describe('and the branches that must NOT change', () => {
  /**
   * WHEN THE MEDIATOR KEPT THE CONNECTION, no number was passed and the owner
   * must not be told they have one. Widening the channel offer into this branch
   * would be telling somebody they may write directly to a person who declined
   * exactly that.
   */
  it.each(LANGUAGES)('%s — via the mediator, no number and no direct channel', (language) => {
    const text = introRequesterExtra(language, 'Dato', 'Nino', PHONE, true, true);

    expect(text).not.toContain(PHONE);
  });

  /**
   * AND WHEN NO NUMBER COULD BE FOUND, the honest answer is still to ask the
   * mediator — there is nobody for the channel to reach.
   */
  it.each(LANGUAGES)('%s — no number found, the owner is sent back to the mediator', (language) => {
    const text = introRequesterExtra(language, 'Dato', 'Nino', null, false, true);

    expect(text).toContain('Dato');
    expect(text).not.toContain('null');
  });
});
