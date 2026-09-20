import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Ticket 20 item 5 — HOW an accepted introduction is made, not just whether.
 *
 * Misho's design, confirmed 20 September: when the assistant asks a mediator to
 * connect two people it must also ask, up front, whether the two are put in
 * touch directly or whether the conversation keeps coming back through them.
 * The mediator chooses; the product does not assume.
 *
 * It assumed. Accepting handed the target's number to the requester every
 * time, out of the mediator's own phonebook, and nobody was ever asked whether
 * that was what they meant by yes. Twenty-two introductions had been accepted
 * that way.
 *
 * THE DECISION WAS HIS AND IT WENT THE OTHER WAY FROM MY FIRST READING. I had
 * it as „the number never goes"; when I showed him it already does, and what
 * Task 16 built it for, he kept the handover and added the choice around it.
 * „direct" is today's behaviour, chosen out loud. „via_mediator" is the new
 * one, and it is the one that withholds.
 */
const SERVICE = readFileSync(join(__dirname, '..', 'introduction.service.ts'), 'utf8');
const TOOL = readFileSync(join(__dirname, '..', 'tools', 'respondToIntroduction.ts'), 'utf8');
const CHAT = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');

describe('an accept has to say how', () => {
  it('is refused outright when the channel is missing', () => {
    // Defaulting would hand over a phone number because nobody was asked —
    // silently, which is worse than the arrangement it replaces.
    expect(TOOL).toContain('accepted && channel === undefined');
    expect(TOOL).toContain('needs_channel: true');
  });

  it('names both options and the buttons, so one retry fixes it', () => {
    // Row 215: a refusal names the way forward rather than being a wall.
    const refusal = TOOL.slice(
      TOOL.indexOf('const CHANNEL_REQUIRED'),
      TOOL.indexOf('export async'),
    );
    expect(refusal).toContain('direct');
    expect(refusal).toContain('via_mediator');
    expect(refusal).toContain('პირდაპირ დააკავშირე');
    expect(refusal).toContain('ჩემი გავლით');
    expect(refusal).toContain('არა, ამჯერად');
    // And says nothing was lost, because nothing was: the yes is not recorded.
    expect(refusal).toContain('არაფერი დაკარგულა');
  });

  it('does not ask a decline for a channel — there is nothing to arrange', () => {
    expect(TOOL).toContain('accepted && channel === undefined');
    expect(TOOL).not.toContain('!accepted && channel');
  });

  it('only accepts the two values, from the model’s free-text input', () => {
    const dispatch = CHAT.slice(
      CHAT.indexOf("case 'respond_to_introduction'"),
      CHAT.indexOf("case 'get_intro_status'"),
    );
    expect(dispatch).toContain("said === 'direct' || said === 'via_mediator'");
  });
});

describe('what each channel does', () => {
  const deliver = SERVICE.slice(
    SERVICE.indexOf('async function deliverAcceptOutcome'),
    SERVICE.indexOf('async function syncRequestThreads'),
  );

  it('via_mediator hands over nothing and says so as a decision, not a failure', () => {
    expect(deliver).toContain("channel === 'via_mediator'");
    // „no number found" and „they chose to stay in the middle" produce the
    // same silence and mean opposite things. A reader who cannot tell them
    // apart will chase the mediator for a contact they deliberately withheld.
    expect(deliver).toContain('ეს მისი გადაწყვეტილებაა, არა ხარვეზი');
    expect(deliver).toContain('ნომერი არავის გადაეცა');
  });

  it('direct keeps what Task 16 built, which is why the choice exists at all', () => {
    // Thirteen accepted introductions had produced no way for anybody to talk
    // to anybody. Removing the handover would walk that back.
    expect(deliver).toContain('წიგნაკიდან');
  });

  it('tells the target the truth for the channel actually chosen', () => {
    // The disclosure line says a number was passed on. On via_mediator none
    // was, so it must not say so — same sentence, two different facts.
    // The condition, not the whole call: prettier wraps the arguments and a
    // single-line assertion would be a test of the formatter.
    expect(deliver).toContain('numberDisclosureLine(');
    expect(deliver).toContain("channel === 'direct' && targetPhone !== null");
  });

  it('reads a request answered before the question existed as direct', () => {
    // NULL is not a third option: it means nobody was asked, and what those
    // people actually got was the handover. Reading it as anything else would
    // rewrite what already happened to them.
    expect(SERVICE).toContain("opts.channel ?? 'direct'");
  });
});
