import { readFileSync } from 'fs';
import { join } from 'path';

import { TOOL_TEXTS } from '../texts';

/**
 * ⚠️ ITEM E — „IS ANYONE ASKING ME SOMETHING?" NEVER LOOKED IN THE INBOX.
 *
 * The tester, 25 September, account 501, thread 24487: the user asked exactly
 * that. Only `get_pending_updates` was called. `check_my_inbox` was never
 * called at all, and FIVE unanswered questions from two members went
 * unmentioned.
 *
 * The data side of this was already fixed this morning — `check_my_inbox` had
 * never queried `task_asks`, so it answered `waiting_for_me: []` twice an hour
 * apart while two real questions waited. That fix was necessary and it was not
 * enough, because a tool that is never called cannot report anything, however
 * correct its query has become. Two readers of the same fault again.
 *
 * THE SELECTION SIDE WAS THE DESCRIPTION, AND IT WAS ARGUING AGAINST US.
 * It said „call it once at the start of a conversation" and „don't lead with
 * either — answer the user's message first, then add these as the last line(s)
 * only". Both are right for an inbox nobody asked about. Both are exactly
 * wrong when the inbox IS the message: the tool was framed as a background
 * courtesy, and the one rule it stated about placement said to bury it.
 *
 * So the rule is now conditional on who raised it, which is what it always
 * meant.
 */
const inbox = TOOL_TEXTS.check_my_inbox.description;
const pending = TOOL_TEXTS.get_pending_updates.description;

describe('the inbox is called when the inbox is the question', () => {
  it('names the question it is the answer to', () => {
    expect(inbox).toContain('WHEN THE INBOX IS THE QUESTION');
    expect(inbox).toContain('is anyone asking me something?');
  });

  /**
   * The wrong tool was not a random pick — „updates due for the user" is the
   * nearer phrase to „is anything waiting for me". So that tool now says what
   * it does not hold, where the model is reading when it has just called it.
   */
  it('says out loud that the other tool cannot answer it', () => {
    expect(inbox).toContain('get_pending_updates does NOT hold incoming requests');
    expect(pending).toContain('does NOT contain requests other people have sent');
    expect(pending).toContain('check_my_inbox');
  });

  /** „Don't lead" survives — scoped to the case it was written for. */
  it('still refuses to lead with an inbox nobody asked about', () => {
    expect(inbox).toContain("Don't lead with either WHEN THE USER DID NOT ASK");
    expect(inbox).toContain('answer their message first');
  });

  it('puts it first when they did ask', () => {
    expect(inbox).toContain('this result is the answer and goes first');
  });

  /**
   * „Nothing is waiting" is a real answer and the one most likely to be
   * dropped: a tool that returns an empty list reads like a tool with nothing
   * to contribute, and the user who asked gets silence instead of „no, nobody".
   * That is the same distinction the ops scripts are built on — „I looked and
   * found nothing" is not „I could not look", and neither one is nothing.
   */
  it('requires an empty inbox to be reported rather than omitted', () => {
    expect(inbox).toContain('a count of nothing is still an answer');
  });
});

/**
 * ⚠️ THIS SECTION SAID THE APP NEEDED NOTHING. IT WAS WRONG, AND THE TEST
 * BELOW ENCODED THE MISTAKE SO THAT A GREEN SUITE WOULD KEEP IT.
 *
 * What stood here, written the same afternoon: „the in-app chat has no
 * `check_my_inbox` and does not need one. An incoming ask arrives there as its
 * OWN thread … The gap is the connector's." The test asserted the app had no
 * such tool, and the comment above it said a failure would mean the app had
 * grown one — as though that could only be somebody else's doing.
 *
 * Row 266, from the tester an hour later: the founder asked exactly that
 * question in APP thread 24751 at 15:03 and heard nothing, while FIVE
 * questions sat in `task_asks` addressed to him. I checked that count myself
 * before believing it: five.
 *
 * The thread-per-ask mechanism is real and I did read it. It is simply not an
 * answer to the question. Somebody who asks this in a DIFFERENT thread gets a
 * model that cannot see other threads and had no tool that enumerates them.
 *
 * I CONFIRMED A SURFACE EXISTED AND CALLED THAT THE QUESTION BEING ANSWERABLE
 * — and I had already told the tester and Misho it was closed. The reason it
 * is worth this many lines is that the day's other faults were the same shape
 * from further away: measuring the right thing about a different question.
 */
describe('the app answers it too, and the claim that it need not is retracted', () => {
  const chat = readFileSync(join(__dirname, '..', '..', 'chat.service.ts'), 'utf8');

  it('the in-app chat HAS an inbox tool now', () => {
    expect(chat).toContain("name: 'check_my_inbox'");
  });

  /** The same three reads as the connector's, so one fault cannot live in two. */
  it('reads the same three sources the connector reads', () => {
    const handler = chat.slice(
      chat.indexOf("case 'check_my_inbox': {"),
      chat.indexOf("case 'get_pending_updates': {"),
    );

    expect(handler).toContain('getPendingRequestsForMediator(userId)');
    expect(handler).toContain('getRecentResponsesForRequester(userId)');
    expect(handler).toContain('getPendingAsksForUser(userId)');
  });

  /**
   * An empty result must be sayable out loud. „The tool returned nothing" read
   * as „the tool had nothing to add" is precisely how five questions stayed
   * invisible.
   */
  it('can say that nothing is waiting', () => {
    expect(chat).toContain('nothing_is_waiting:');
  });

  /**
   * The reply belongs in the ask's own thread, not in whatever conversation
   * the person happened to ask from — so the answer carries somewhere to go.
   * The thread-per-ask design was never wrong; it was only never reachable.
   */
  it('points at the thread where the question can be answered', () => {
    expect(chat).toContain('thread_id: ask.ask_thread_id ?? null');
    expect(chat).toContain("name: 'send_answer_to_asker'");
  });
});
