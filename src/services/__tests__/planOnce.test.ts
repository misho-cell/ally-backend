import {
  choicesWithoutApproval,
  INVITE_SHARE_NOTE,
  PLAN_ALREADY_ON_SCREEN,
  planProposedResult,
  WAKE_SHARE_NOTE,
} from '../chat.service';

/**
 * Ticket 20 row 101 — the plan shows once.
 *
 * Tornike's word on 17 September, after five real examples: the saved plan
 * (the rendered propose_task_plan message) is the only plan text on the
 * screen, and the assistant's message above the buttons says only what it
 * found and asks the one question.
 *
 * On goals 3796, 3829, 3862, 3928 and 3961 the reply wrote the plan again in
 * its own words — and on three of them it said something the saved plan did
 * not, which is the reason this is a correctness row and not a tidiness one.
 */
describe('what propose_task_plan hands back', () => {
  const SUMMARY = 'გეგმა v1 (დასამტკიცებელი)\nმოგვარებულია, როცა: …';

  it('withholds the plan text once the server has put it on the screen', () => {
    // The whole of row 101 that is OURS to guarantee. Handing the model the
    // text and telling it not to use it is a losing instruction; not handing
    // it over is code.
    const out = planProposedResult(1, SUMMARY, true);

    expect(out).toEqual({ proposed: true, version: 1, next: PLAN_ALREADY_ON_SCREEN });
    expect(JSON.stringify(out)).not.toContain('მოგვარებულია, როცა');
  });

  it('still sends the plan when the server could NOT put it on the screen', () => {
    // Outside a thread, or when the stored plan cannot be read back. Silence
    // here would mean the user is asked to approve a plan they were never
    // shown — far worse than showing it twice.
    expect(planProposedResult(1, SUMMARY, false)).toEqual({
      proposed: true,
      version: 1,
      summary: SUMMARY,
    });
  });

  it('tells the model what to write instead, not only what not to write', () => {
    // „Do not repeat the plan" on its own leaves the model to guess what the
    // message above the buttons is for, and a guess there is a blank reply or
    // the plan again.
    expect(PLAN_ALREADY_ON_SCREEN).toContain('ხელახლა');
    expect(PLAN_ALREADY_ON_SCREEN).toContain('რაც იპოვე');
    expect(PLAN_ALREADY_ON_SCREEN).toContain('present_choices');
  });

  it('closes the three ways round it, by name', () => {
    // Measured: „in its own words" is what actually happened on 3961, so
    // forbidding a verbatim repeat alone would have changed nothing.
    expect(PLAN_ALREADY_ON_SCREEN).toContain('სრულად');
    expect(PLAN_ALREADY_ON_SCREEN).toContain('შემოკლებულად');
    expect(PLAN_ALREADY_ON_SCREEN).toContain('სხვა სიტყვებით');
  });
});

/**
 * Ticket 20 row 203 — when nobody in the plan can be written to, do not ask
 * for approval.
 *
 * Tornike's word on 17 September, plus his own addition: „when someone is not
 * on netai, suggest whom to invite to make netwokr work".
 *
 * Goal 3961 is the shape of the fault: the saved plan said nobody would be
 * asked, the reply said nobody needs to be written to because the notaries are
 * his own contacts to ring — and then it asked him to approve the plan.
 * Approving would have done nothing at all.
 */
describe('row 203 — the card when nobody can be written to', () => {
  const SUMMARY = 'გეგმა v1 (დასამტკიცებელი)';
  const unreachable = (invitees: string[], toWake: string[] = []) => ({
    nobodyReachable: true,
    invitees,
    toWake,
  });

  it('says the approve button must not be offered, and what to offer instead', () => {
    const out = planProposedResult(1, SUMMARY, true, unreachable([]));

    expect(out.nothing_to_send_today).toBe(true);
    const instead = String(out.instead);
    expect(instead).toContain('„ვამტკიცებ" ღილაკს');
    // All three of Tornike's next steps, by name.
    expect(instead).toContain('თვითონ დავურეკავ');
    expect(instead).toContain('მოწვევა გავაგზავნო');
    expect(instead).toContain('სხვაც მოძებნე');
  });

  it('names whom to invite, which is the half Tornike added himself', () => {
    const instead = String(
      planProposedResult(1, SUMMARY, true, unreachable(['ლევან ლაშქარავა', 'ილია ბაბუხადია']))
        .instead,
    );

    expect(instead).toContain('ლევან ლაშქარავა');
    expect(instead).toContain('ილია ბაბუხადია');
    expect(instead).toContain('invite_contact');
  });

  it('asks for no invitation when there is nobody to invite', () => {
    // Everyone unreachable for a reason an invitation does not fix — they have
    // an account and have never opened it. Offering to invite them again would
    // be advice that cannot work.
    const instead = String(planProposedResult(1, SUMMARY, true, unreachable([])).instead);

    expect(instead).not.toContain('invite_contact');
  });

  it('leaves an ordinary plan exactly as it was', () => {
    const out = planProposedResult(1, SUMMARY, true);

    expect(out.nothing_to_send_today).toBeUndefined();
    expect(out.instead).toBeUndefined();
    expect(out).toEqual({ proposed: true, version: 1, next: PLAN_ALREADY_ON_SCREEN });
  });
});

/**
 * Ticket 20 row 203, second pass — Tornike's rule behind his answer, and the
 * list I had wrongly left empty.
 *
 * His words: „a goal that cannot be achieved today is still a goal. Today the
 * network may have 50 users, in three weeks 200; Netai keeps working on the
 * goal the whole time, and when a newcomer who can solve it arrives, she sees
 * it and acts."
 */
describe('row 203 second pass — today, not the goal', () => {
  const SUMMARY = 'გეგმა v1 (დასამტკიცებელი)';

  it('says nothing can be SENT today, and that the goal stays open', () => {
    // The old field was called approval_pointless, which reads as a verdict on
    // the goal. Nothing can be sent today; the goal is not over.
    const out = planProposedResult(1, SUMMARY, true, {
      nobodyReachable: true,
      invitees: [],
      toWake: [],
    });

    expect(out.nothing_to_send_today).toBe(true);
    const instead = String(out.instead);
    expect(instead).toContain('დღეს');
    expect(instead).toContain('მიზანი ღია რჩება');
  });

  it('names the people to WAKE, which is not the people to invite', () => {
    // D61: an account that has never been opened is how this network grows.
    // „No invitation applies" is not „nothing applies", and I had been
    // substituting the second for the first.
    const instead = String(
      planProposedResult(1, SUMMARY, true, {
        nobodyReachable: true,
        invitees: ['ლევან ლაშქარავა'],
        toWake: ['ილია ბაბუხადია'],
      }).instead,
    );

    expect(instead).toContain('ლევან ლაშქარავა');
    expect(instead).toContain('invite_contact');
    expect(instead).toContain('ილია ბაბუხადია');
    expect(instead).toContain('Netai ჯერ არ გაუხსნიათ');
  });

  it('keeps the two lists apart rather than merging them', () => {
    // Offering to invite somebody who already has an account is advice that
    // cannot work, and asking somebody with no account to "open Netai" is the
    // same mistake the other way round.
    const onlyWake = String(
      planProposedResult(1, SUMMARY, true, {
        nobodyReachable: true,
        invitees: [],
        toWake: ['ილია'],
      }).instead,
    );

    expect(onlyWake).not.toContain('invite_contact');
    expect(onlyWake).toContain('ილია');
  });
});

/**
 * Ticket 20 row 153 — an invitation in a goal chat is one tap, not a link to
 * copy.
 *
 * Lika, from Ninia's account, 17 September: a first-circle person who is not
 * on Netai came back as „here is a link, send it". Her own words for what
 * would be right — a button she presses and it is sent easily. The founder's
 * rule stands either way: Netai never messages a non-member, the user sends
 * it, with one tap.
 *
 * On goal 3995 invite_contact ran at 07:20:06 and returned invite_text; the
 * reply at 07:20:49 pasted the text and the code into the message; share_text
 * on that message was null, so no share button could show.
 *
 * The machinery shipped with row 39. get_invite_link was wired to it and
 * invite_contact — the one a goal chat actually uses — was not.
 */
describe('row 153 — the invitation rides the run, not the prose', () => {
  it('the tool result tells the model not to paste the text, the link or the code', () => {
    // Asserted on the note itself: whether a model obeys is evidence, but
    // whether we ask is code. All three were pasted on 3995.
    const note = INVITE_SHARE_NOTE;

    expect(note).toContain('გაზიარების ღილაკით');
    expect(note).toContain('ნუ ჩასვამ');
    expect(note).toContain('ბმულს');
    expect(note).toContain('კოდს');
  });

  it('is written in Georgian only — no stray Latin in the Georgian', () => {
    // Row 155 is about exactly this kind of character reaching a screen, and
    // I put a corrupted word in this very string while writing it.
    expect(note_hasOnlyExpectedScripts(INVITE_SHARE_NOTE)).toBe(true);
  });
});

/** Georgian, spaces and ordinary punctuation — nothing else. */
function note_hasOnlyExpectedScripts(text: string): boolean {
  return !/[A-Za-zÀ-ɏЀ-ӿ]/.test(text);
}

/**
 * Ticket 20 row 203, third pass — the approve button is removed, not discouraged.
 *
 * The second pass put the instruction in the tool's result and I wrote that „an
 * instruction is the proportionate tool". Goal 4358 disagreed: the plan named
 * nobody and the approve button was on the screen anyway, on the event-run
 * path. A button that starts a plan which can reach nobody is not a wasted tap
 * to be discouraged; it is a promise to be withheld.
 */
describe('row 203 — the buttons a run may actually show', () => {
  it('removes the approve button and keeps the change button', () => {
    expect(choicesWithoutApproval(['ვამტკიცებ', 'შევცვალოთ'])).toEqual(['შევცვალოთ']);
    // And by what the label MEANS, not how it is spelt: the button's wording
    // changed on 17 September and a model still types the old one.
    expect(choicesWithoutApproval(['დამტკიცებულია', 'შევცვალოთ'])).toEqual(['შევცვალოთ']);
    expect(choicesWithoutApproval(['დამადასტურებრი', 'შევცვალოთ'])).toEqual(['შევცვალოთ']);
  });

  it('leaves an ordinary set of buttons untouched', () => {
    const choices = ['თვითონ დავურეკავ', 'მოწვევა გავაგზავნო', 'სხვაც მოძებნე'];

    expect(choicesWithoutApproval(choices)).toEqual(choices);
  });

  it('shows NO buttons rather than an empty row', () => {
    // A strip of nothing where the screen promises a choice is its own small
    // lie, and the client renders whatever array it is given.
    expect(choicesWithoutApproval(['ვამტკიცებ'])).toBeUndefined();
    expect(choicesWithoutApproval(['დამტკიცებულია'])).toBeUndefined();
    expect(choicesWithoutApproval([])).toBeUndefined();
  });

  it('the instruction the model gets still names the real next step', () => {
    // The code guarantee replaces nothing: the instruction is what gets the
    // model to offer something USEFUL instead of an approval.
    const result = planProposedResult(1, 'summary', true, {
      nobodyReachable: true,
      invitees: ['დათო'],
      toWake: ['ნინო'],
    });

    expect(result.nothing_to_send_today).toBe(true);
    expect(String(result.instead)).toContain('დათო');
    expect(String(result.instead)).toContain('ნინო');
    // Row 203 second pass, Tornike's rule: this says nothing about the GOAL.
    expect(String(result.instead)).toContain('მიზანი ღია რჩება');
  });
});

/**
 * Ticket 20 row 153, second pass — the same button, a different true sentence.
 */
describe('row 153 — a wake is not an invitation', () => {
  it('the wake note says they already have an account and needs no code', () => {
    expect(WAKE_SHARE_NOTE).toContain('ძველი ანგარიში');
    expect(WAKE_SHARE_NOTE).toContain('ნუ ჩასვამ');
    expect(note_hasOnlyExpectedScripts(WAKE_SHARE_NOTE.replace(/Netai|Ally/g, ''))).toBe(true);
  });
});
