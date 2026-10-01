import { readFileSync } from 'fs';
import { introMediatorFollowUp, introRequesterExtra, numberDisclosureLine } from '../introOpening';
import { introOutcomeEvent } from '../taskEngine.events';
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
import { introChannelRequired } from '../introOpening';

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
    const refusal = introChannelRequired('ka');
    expect(refusal).toContain('direct');
    expect(refusal).toContain('via_mediator');
    expect(refusal).toContain('პირდაპირ დააკავშირე');
    expect(refusal).toContain('ჩემი გავლით');
    expect(refusal).toContain('არა, ამჯერად');
    // And says nothing was lost, because nothing was: the yes is not recorded.
    expect(refusal).toContain('არაფერი დაკარგულა');
  });

  /**
   * AND THE BUTTONS ARE IN THE MEDIATOR'S LANGUAGE, caught on a pre-flight
   * read minutes before the seat was due to answer the first introduction in
   * fourteen days — as an ENGLISH-speaking mediator.
   *
   * The refusal is model-facing, which is fine on its own. What is not fine is
   * that it names the exact BUTTON LABELS the model puts on the person's
   * screen. Three Georgian buttons, asking somebody whether to give away a
   * third person's phone number.
   *
   * This product has been bitten by a Georgian button in an English thread
   * before and it was not cosmetic then either — an unrecognised approve label
   * made `approvalBelongsToThePlan` false and an owner's yes had nowhere to
   * land. Here the stakes are a phone number.
   */
  it.each(['en', 'ru', 'es'] as const)('offers %s buttons to an %s mediator', (language) => {
    const refusal = introChannelRequired(language);
    expect(refusal).not.toMatch(/[Ⴀ-ჿ]/);
    // The two channel VALUES are code and stay as they are in every language.
    expect(refusal).toContain('direct');
    expect(refusal).toContain('via_mediator');
    // Three buttons, still, and the third is the decline.
    expect(refusal).toContain('present_choices');
  });

  it('the tool asks the mediator which language, not the requester', () => {
    expect(TOOL).toContain('userLanguage(mediatorUserId)');
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
    //
    // The sentences moved to introOpening.ts on 20 September with their four
    // languages, so they are CALLED here rather than read out of the service.
    expect(introRequesterExtra('ka', 'ნინო', 'დათო', null, true, false)).toContain(
      'ეს მისი გადაწყვეტილებაა, არა ხარვეზი',
    );
    expect(introMediatorFollowUp('ka', 'ნინო', 'დათო', null, true, false)).toContain(
      'ნომერი არავის გადაეცა',
    );
  });

  /**
   * And in every language, because this is the branch where somebody's number
   * was deliberately NOT handed over and the reader has to be able to tell
   * that from „we could not find it".
   */
  it.each(['en', 'ru', 'es'] as const)('%s says the withholding was a choice', (language) => {
    const said = introRequesterExtra(language, 'Nino', 'Dato', null, true, false);
    expect(said).not.toMatch(/[Ⴀ-ჿ]/);
    // The two must not read alike: one is a decision, the other is ignorance.
    const noNumberFound = introRequesterExtra(language, 'Nino', 'Dato', null, false, false);
    expect(said).not.toBe(noNumberFound);
  });

  it('direct keeps what Task 16 built, which is why the choice exists at all', () => {
    // Thirteen accepted introductions had produced no way for anybody to talk
    // to anybody. Removing the handover would walk that back. The sentence
    // itself moved to introOpening.ts on 20 September with its four languages
    // — introNumberDisclosure.test.ts holds it — so what is asserted here is
    // that this function still decides the fact.
    expect(numberDisclosureLine('ka', true, 'ნინო', 'დათო')).toContain('წიგნაკიდან');
  });

  it('tells the target the truth for the channel actually chosen', () => {
    // The disclosure line says a number was passed on. On via_mediator none
    // was, so it must not say so — same sentence, two different facts.
    // The condition, not the whole call: prettier wraps the arguments and a
    // single-line assertion would be a test of the formatter.
    expect(deliver).toContain("channel === 'direct' && targetPhone !== null");
  });

  it('reads a request answered before the question existed as direct', () => {
    // NULL is not a third option: it means nobody was asked, and what those
    // people actually got was the handover. Reading it as anything else would
    // rewrite what already happened to them.
    expect(SERVICE).toContain("opts.channel ?? 'direct'");
  });
});

/**
 * ITEM 5 WAS BUILT ON THE PATH NOBODY WALKS, and request 1123 is how I found
 * out — on the seat's own test, six hours after shipping it.
 *
 *   13:01:37  the request is created (the routing fix working, first in 14 days)
 *   13:12:35  the mediator ACCEPTS — status accepted, intro_channel NULL
 *   —         respond_to_introduction called ZERO times, ever
 *
 * The accept came through the app's button. The guard that refuses a
 * channel-less accept lives in the CHAT TOOL, so it was never on the path a
 * mediator actually takes: the choice was never asked, and a stored NULL reads
 * as `direct` — the number goes, in silence, which is the exact arrangement
 * item 5 exists to end.
 *
 * What is asserted here is the ADDITIVE half, which is all a backend may
 * decide alone: the route accepts a channel and passes it through. A REFUSAL
 * on this route would break the button under real people mid-flight and is a
 * product call with a phone number on the end of it — written up, not taken.
 */
describe('the button path, which is the one mediators actually use', () => {
  const ROUTE = readFileSync(
    join(__dirname, '..', '..', 'api', 'routes', 'requests.routes.ts'),
    'utf8',
  );

  it('accepts a channel and validates it against the same two values', () => {
    expect(ROUTE).toContain("body('channel')");
    expect(ROUTE).toContain("isIn(['direct', 'via_mediator'])");
  });

  it('passes it to the one resolver both paths share', () => {
    expect(ROUTE).toContain('channel !== undefined && { channel }');
  });

  it('still works without one — the app has not been changed yet', () => {
    // `.optional()`, so today's button keeps working unchanged. The silence it
    // produces is the product question, not a thing to break from here.
    expect(ROUTE).toMatch(/body\('channel'\)\s*\.optional\(\)/);
  });
});

/**
 * THREE PEOPLE, ONE INTRODUCTION, TWO CONTRADICTING ON WHETHER A PHONE NUMBER
 * MOVED. Request 1123, 20 September, within forty-one seconds:
 *
 *   to the MEDIATOR  „I passed Netai Test 4's contact to Netai Test 1"
 *   to the TARGET    „your number was passed from Netai Test 2's phonebook"
 *   to the ASKER     „they chose to keep it through themselves rather than
 *                     handing over contact details directly"
 *
 * The first two are server templates and they were right. The third is the
 * model filling in a fork this event handed it — „if the contact has already
 * been handed over… IF NOT, say whom to get it from" — with nothing to decide
 * on. It filled it in backwards.
 *
 * So the person whose number moved was told it moved, and the person who
 * received it was told it had not. One of them acts on a false belief about
 * where a phone number is.
 */
describe('the requester’s goal wake is told what actually happened', () => {
  const EVENTS = readFileSync(join(__dirname, '..', 'taskEngine.events.ts'), 'utf8');

  it('states the fact instead of offering the model a fork', () => {
    // The conditional that produced the wrong half is gone from the EVENT
    // BODY. It survives a few lines above, inside the note that records what
    // it cost — deleting the quote would delete the evidence, which is the
    // same reason introNumberDisclosure scopes its assertion rather than the
    // whole file.
    const built = introOutcomeEvent('Dato', true, 'handed_over').en;
    expect(built).not.toContain('if the contact has already been handed over');
    expect(EVENTS).toContain('IntroContactOutcome');
  });

  it.each(['ka', 'en', 'ru', 'es'] as const)('%s says which of the three it was', (language) => {
    const handed = introOutcomeEvent('Dato', true, 'handed_over')[language];
    const withheld = introOutcomeEvent('Dato', true, 'kept_by_mediator')[language];
    const missing = introOutcomeEvent('Dato', true, 'not_found')[language];
    expect(new Set([handed, withheld, missing]).size).toBe(3);
  });

  it('forbids the sentence that was actually written, when nothing moved', () => {
    expect(introOutcomeEvent('Dato', true, 'kept_by_mediator').en).toContain(
      'NO contact was handed over',
    );
    expect(introOutcomeEvent('Dato', true, 'kept_by_mediator').en).toContain(
      'Do NOT tell the owner they have the number',
    );
  });

  /**
   * ROW 251 CHANGED WHAT „IT HAS MOVED" IS SUPPOSED TO MEAN, so this assertion
   * moved with it rather than being deleted.
   *
   * It used to read „ALREADY been handed over — remind them they can write
   * themselves now", and the tester caught the assistant obeying that to the
   * letter on threads 22518 and 22476: „this is one for you to send yourself
   * rather than through me", and nothing was ever sent. The founder's rule
   * (D438) is that after the yes the two ASSISTANTS carry it.
   *
   * What the test still holds is the same thing it always held — that this
   * branch says plainly that the connection is open, and does not hedge. What
   * changed is where the owner is pointed: through Netai, not out of it.
   */
  it('and says plainly that it HAS moved, when it has', () => {
    const built = introOutcomeEvent('Dato', true, 'handed_over').en;

    expect(built).toContain('direct channel to Dato is open');
    expect(built).toContain('directly through Netai');
    // The whole of the row: nobody is sent off to do it themselves.
    expect(built).not.toContain('write themselves');
  });

  /**
   * AND EVERY LANGUAGE SAYS IT, because the owner reading this in Georgian is
   * the common case and a rule that only lands in English is not a rule. The
   * three that are not English were the ones most likely to be left behind.
   */
  it.each(['ka', 'en', 'ru', 'es'] as const)('%s points through Netai, not out of it', (lang) => {
    expect(introOutcomeEvent('Dato', true, 'handed_over')[lang]).toMatch(/Netai/);
  });

  /**
   * The fact comes from the SAME branch the other two messages come from.
   * Deriving it a second way is how three accounts of one event drift apart —
   * which is the whole of this bug.
   *
   * ⚠️ ASSERTED ON THE SHAPE, NOT ON THE SOURCE TEXT. This test used to read
   * four exact spellings out of `introduction.service.ts`, and every one of
   * them broke the moment the boolean became three states — a test that fails
   * because the thing it guards got BETTER teaches the next person to delete
   * it. Four source-window tests broke on me in one day on 28 September for
   * exactly this reason. What matters is that one value carries the fact and
   * that every state is a distinct instruction; both are checked by calling.
   */
  it('carries one value for the fact, with a distinct instruction per state', () => {
    const states = ['handed_over', 'kept_by_mediator', 'not_found'] as const;
    const built = states.map((s) => introOutcomeEvent('Dato', true, s).en);

    expect(new Set(built).size).toBe(states.length);
    for (const text of built) expect(text.length).toBeGreaterThan(0);
  });

  /**
   * ROW 309 — THE THIRD STATE, AND WHY A BOOLEAN COULD NOT CARRY IT.
   *
   * 29 September, the founder's own account: he accepted Giorgi's introduction
   * and chose `direct`. The contact lookup read a stale row and came back
   * empty, so the one false branch fired and Giorgi was told the founder „chose
   * to keep the connection through himself" — the opposite of his choice, put
   * in his mouth by us.
   *
   * „We could not find it" and „they decided to stay in the middle" are not
   * the same sentence and must never share one.
   */
  it('never reports our own lookup failing as the mediator’s decision', () => {
    const missing = introOutcomeEvent('Dato', true, 'not_found').en;
    const chosen = introOutcomeEvent('Dato', true, 'kept_by_mediator').en;

    expect(missing).not.toBe(chosen);
    expect(missing).not.toContain('the mediator chose');
    // It still must not promise a number nobody has.
    expect(missing).toContain('Do NOT tell the owner they have the number');
    // Plate v301 G6: „we are fixing this" reached a user. No internal talk.
    expect(missing).toContain('Never mention a fault, a fix or anything internal');
    expect(missing).not.toContain('fixing it');
  });

  /** The Georgian reader gets the same three-way distinction, not a fallback. */
  it('keeps the three apart in Georgian too', () => {
    const missing = introOutcomeEvent('Dato', true, 'not_found').ka;

    expect(missing).toContain('შუამავალი დათანხმდა');
    expect(missing).not.toContain('ვასწორებთ');
    expect(missing).not.toContain('შუამავალმა აირჩია');
  });
});

/**
 * The tester's 992 (F2): the MEDIATOR tapped „connect directly" and the asker
 * was told the target agreed. The target had answered nothing.
 */
describe('a mediated yes says who said it', () => {
  it.each(['ka', 'en', 'ru', 'es'] as const)(
    '%s names the mediator, not the target',
    (language) => {
      const event = introOutcomeEvent('Dato', true, 'handed_over', 'Nino')[language];

      expect(event).toContain('Nino');
      expect(event.indexOf('Nino')).toBeLessThan(event.indexOf('Dato'));
    },
  );

  it('forbids saying the target agreed', () => {
    expect(introOutcomeEvent('Dato', true, 'kept_by_mediator', 'Nino').en).toContain(
      'Never say Dato agreed',
    );
  });

  it('names who declined, too', () => {
    expect(introOutcomeEvent('Dato', false, 'kept_by_mediator', 'Nino').en).toMatch(
      /^The mediator, Nino, declined/,
    );
  });

  it('leaves a direct answer as it was', () => {
    expect(introOutcomeEvent('Dato', true, 'handed_over', null)).toEqual(
      introOutcomeEvent('Dato', true, 'handed_over'),
    );
  });
});
