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
 * WHAT I CHECKED AND DID NOT CHANGE, so that this is not read as wider than it
 * is: the in-app chat has no `check_my_inbox` and does not need one. An
 * incoming ask arrives there as its OWN thread, where the reply goes back
 * through `send_answer_to_asker`, and introduction requests arrive as
 * `intro_request` cards in the update queue. The gap is the connector's,
 * because the connector has neither of those surfaces — only this tool.
 */
describe('the surfaces that were checked and left alone', () => {
  const chat = readFileSync(join(__dirname, '..', '..', 'chat.service.ts'), 'utf8');

  /**
   * If this ever fails, the app has grown an inbox tool and the reasoning
   * above is stale — the description fixed here would then need the same
   * treatment in a second place, which is the shape of fault that has cost
   * most this month.
   */
  it('the in-app chat still has no check_my_inbox', () => {
    expect(chat).not.toContain("name: 'check_my_inbox'");
  });

  it('answers an incoming ask through its own thread instead', () => {
    expect(chat).toContain("name: 'send_answer_to_asker'");
  });
});
