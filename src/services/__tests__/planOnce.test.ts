import { PLAN_ALREADY_ON_SCREEN, planProposedResult } from '../chat.service';

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
    expect(instead).toContain('„დამტკიცებულია" ღილაკს');
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
