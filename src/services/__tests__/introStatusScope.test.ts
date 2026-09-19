import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * The seat's 293 — „something that doesn't appear to have happened."
 *
 * Test 2 asked „When did I agree to introduce Netai Test 1 to Netai Test 3?"
 * Forty minutes earlier, in that same account, they had typed „Yes, happy to
 * introduce them. Netai Test 3 is a good friend of mine", and the relay that
 * reached Test 3 at 18:51:07 exists because of it. They were told there is no
 * such agreement in their history and that they were asking about something
 * that did not appear to have happened.
 *
 * THE MODEL DID THE RIGHT THING and the tool log proves it: one call,
 * `get_intro_status`, zero results. The fault was entirely in what that tool
 * could see. It read `getIntroStatusForRequester` — whose own name is the bug
 * report — and the person asking was the MEDIATOR.
 *
 * Two faults, and the second is the one that made it frightening rather than
 * merely unhelpful: the scope, and turning an empty search into a denial.
 */
const INTRO_SERVICE = readFileSync(join(__dirname, '..', 'introduction.service.ts'), 'utf8');
const CHAT_SERVICE = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');

describe('what get_intro_status can see', () => {
  it('reads the mediator side, not only the requester side', () => {
    expect(INTRO_SERVICE).toContain('getIntroStatusForMediator');
    // The discriminator that was missing: the same table, the other column.
    const mediator = INTRO_SERVICE.slice(
      INTRO_SERVICE.indexOf('export async function getIntroStatusForMediator'),
      INTRO_SERVICE.indexOf('export interface PassedOnRow'),
    );
    expect(mediator).toContain('ir.mediator_user_id = $1');
  });

  it('reads the shape this agreement actually took — a relay, in task_asks', () => {
    // Not every agreement to introduce somebody is an introduction_requests
    // row. Test 2's was an ask they answered and passed on, which is a child
    // ask whose sender is them.
    const passed = INTRO_SERVICE.slice(
      INTRO_SERVICE.indexOf('export async function getPassedOnAsks'),
      INTRO_SERVICE.indexOf('export async function getPassedOnAsks') + 1200,
    );
    expect(passed).toContain('task_asks');
    expect(passed).toContain('p.id = c.parent_ask_id');
    expect(passed).toContain('c.from_user_id = $1::int');
  });

  /**
   * The seat found the fourth by being signed in as it: three readers shipped
   * at 20:35 and the first question put to the new build came from Test 3, who
   * is the TARGET — the person a stranger's assistant wrote to, who agreed to
   * meet somebody they do not know, and who then could not ask their own
   * assistant what they had agreed to. Ask 2674, relayed at 18:51:07, answered
   * „Yes, happy to meet", invisible to its owner.
   */
  it('reads the TARGET side — the person somebody wanted to meet', () => {
    const target = INTRO_SERVICE.slice(
      INTRO_SERVICE.indexOf('export async function getIntroStatusForTarget'),
      INTRO_SERVICE.indexOf('export async function getIntroStatusForTarget') + 2400,
    );
    // Both shapes, because an introduction reaches a target either as a named
    // introduction_requests row or as a relayed ask.
    expect(target).toContain('ir.target_user_id = $1::int');
    expect(target).toContain('c.to_user_id = $1::int AND c.parent_ask_id IS NOT NULL');
    // Who wanted the meeting is the chain's origin, not the bridge who
    // forwarded it — getting those two the wrong way round would name the
    // wrong person to somebody deciding whether to meet a stranger.
    expect(target).toContain('o.id = c.origin_user_id');
    expect(target).toContain('b.id = c.from_user_id');
  });

  it('asks all four in one call, so a caller cannot see one side by accident', () => {
    const dispatch = CHAT_SERVICE.slice(
      CHAT_SERVICE.indexOf("case 'get_intro_status'"),
      CHAT_SERVICE.indexOf("case 'get_thread_context'"),
    );
    expect(dispatch).toContain('getIntroStatusForRequester');
    expect(dispatch).toContain('getIntroStatusForMediator');
    expect(dispatch).toContain('getPassedOnAsks');
    expect(dispatch).toContain('getIntroStatusForTarget');
  });
});

describe('what an empty result is allowed to mean', () => {
  it('tells the model that nothing found is not nothing happened', () => {
    const dispatch = CHAT_SERVICE.slice(
      CHAT_SERVICE.indexOf("case 'get_intro_status'"),
      CHAT_SERVICE.indexOf("case 'get_thread_context'"),
    );
    expect(dispatch).toContain('NOT evidence that');
    expect(dispatch).toContain('do not');
    // And only on the empty result: a note on every call is a note nobody
    // reads, and there is nothing to warn about when rows came back.
    expect(dispatch).toContain('found === 0');
  });

  it('says the same thing in the tool description, where the model reads first', () => {
    const tool = CHAT_SERVICE.slice(
      CHAT_SERVICE.indexOf('const GET_INTRO_STATUS_TOOL'),
      CHAT_SERVICE.indexOf('const RESPOND_TO_INTRODUCTION_TOOL'),
    );
    expect(tool).toContain('not the same as nothing having happened');
    // The three sides named where the model chooses the tool, not only in the
    // result it gets back.
    expect(tool).toContain('PASSED ON');
  });
});
