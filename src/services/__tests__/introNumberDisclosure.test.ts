import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * What the person being introduced is told about their own phone number.
 *
 * The line said, to every registered target, in every case:
 *
 *     „შენი ნომერი ამ შეტყობინებით არავის გადაცემია."
 *     (your number has not been given to anyone with this message)
 *
 * It is literally true about that message and false about the event. In the
 * same operation the requester's thread receives this person's number, out of
 * the mediator's own phonebook. Twenty-two introductions have been accepted on
 * this system. Somebody reading „my number has not gone anywhere" at the exact
 * moment it went somewhere is being misled by a sentence engineered to be
 * defensible.
 *
 * THE BEHAVIOUR STAYS — Misho's decision, made after being shown that handing
 * the contact over is what Task 16 built, because thirteen accepted
 * introductions had previously produced no way for anybody to talk to anybody.
 * Only the sentence changes, and it changes to the truth.
 *
 * Read as text: this is a fixed string written by the server into somebody's
 * thread, so there is no return value to assert on. The failure mode is a
 * sentence, so the test reads sentences.
 */
const SOURCE = readFileSync(join(__dirname, '..', 'introduction.service.ts'), 'utf8');
const DISCLOSURE = SOURCE.slice(
  SOURCE.indexOf('function numberDisclosureLine'),
  SOURCE.indexOf('async function deliverAcceptOutcome'),
);
/** The function that composes and saves the target's message. */
const DELIVER = SOURCE.slice(
  SOURCE.indexOf('async function deliverAcceptOutcome'),
  SOURCE.indexOf('async function syncRequestThreads'),
);

describe('what the target is told about their own number', () => {
  it('no longer claims nothing was passed on, in any branch', () => {
    // Scoped to the code that WRITES the message, not to the file: the sentence
    // is quoted in the comment above the fix, on purpose. Deleting the quote
    // would delete the record of what was wrong, and a file-wide assertion
    // would force exactly that.
    expect(DISCLOSURE).not.toContain('ამ შეტყობინებით');
    expect(DELIVER).not.toContain('ამ შეტყობინებით');
  });

  it('says who gave it and to whom, when it really was given', () => {
    // Not „your number may have been shared" — the two names, because a
    // person who has just learned this will want to know exactly that.
    expect(DISCLOSURE).toContain('თავისი წიგნაკიდან');
    expect(DISCLOSURE).toContain("geoName(mediatorName, 'erg')");
    expect(DISCLOSURE).toContain("geoName(requesterName, 'dat')");
    // And why, in the product's own terms, so it reads as a consequence of a
    // decision somebody made rather than as a leak.
    expect(DISCLOSURE).toContain('თანხმობა სწორედ ამას ნიშნავს');
  });

  it('keeps the true version for the case where nothing was given', () => {
    // No number in the mediator's phonebook: the requester is told to ask them
    // for it, so „nothing was passed on" is accurate and stays.
    expect(DISCLOSURE).toContain('შენი ნომერი არავის გადაცემია');
    expect(DISCLOSURE).toContain('უნდა სთხოვოს');
  });

  it('offers only what the product can actually do', () => {
    // stop_contacting_me really does stop every future question through Netai,
    // so that is offered. NOTHING takes a number back once it is in somebody's
    // hands, and promising otherwise would be the same class of comfort as the
    // sentence being replaced.
    expect(DISCLOSURE).toContain('Netai-ს გავლით კითხვები');
    expect(DISCLOSURE).not.toMatch(/დავაბრუნებ|წავშლი|გავაუქმებ/);
  });

  it('branches on whether the number was actually handed over', () => {
    // The same condition that decides whether the requester gets the number
    // decides what the target is told about it — one fact, one source.
    //
    // It gained a second half with item 5: „a number exists" is no longer
    // enough, because on `via_mediator` one exists and is deliberately not
    // given. The disclosure follows what was DONE, not what was findable.
    expect(SOURCE).toContain('numberDisclosureLine(');
    expect(SOURCE).toContain("channel === 'direct' && targetPhone !== null");
  });
});
