import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Row 210, 19 September — the bridge said yes, the introduction went out, and
 * the owner who paid for the chain was never told.
 *
 * Goal 6205. Test 2 answered „Yes, happy to introduce them. Netai Test 3 is a
 * good friend of mine." The run called `relay_ask`, ask 2674 reached Test 3 at
 * 18:51:07 — and ask 2609, the one Test 2 was answering, is still
 * `status = 'sent'` with `answered_at` NULL. No `answer_received`, no wake,
 * nothing to the owner. The goal was awake, it acted, it spent his tokens, and
 * it skipped the person it was working for.
 *
 * The cause was a sentence this file now forbids. Four relay outcomes told the
 * model „the user's answer has already reached the asker — a separate,
 * automatic path that always works." There WAS such a path; D48 removed it,
 * and `sendApprovedAskAnswer` in the same file says so: „this is now the ONLY
 * path an answer takes to the asker". The server was telling the model, in a
 * tool result, that the one thing it still had to do was already done.
 *
 * READ AS TEXT, DELIBERATELY. These strings are consumed by a model, not by a
 * function, so there is no return value to assert on and no call that can be
 * made to observe them. The failure mode is a sentence, so the test reads
 * sentences. It is the same reason modelOnlyNudges.test.ts reads exports.
 */
const SOURCE = readFileSync(join(__dirname, '..', 'taskAsks.service.ts'), 'utf8');

describe('what a relay outcome is allowed to claim about the answer', () => {
  it('never says the answer has already gone, because since D48 it has not', () => {
    // The exact claim that cost the introduction, and the shapes near it.
    expect(SOURCE).not.toContain('პასუხი კითხვის ავტორს უკვე გადაეცა');
    expect(SOURCE).not.toContain('ავტომატური გზაა');
    expect(SOURCE).not.toContain('სახელი კითხვის ავტორს უკვე მივიდა');
  });

  it('names the call that is still owed, so the reminder is actionable', () => {
    // Row 215's lesson applied to a tool result: a refusal that names the way
    // forward beats one that is only a wall. The reminder is useless unless it
    // says what to do next.
    const reminder = SOURCE.slice(
      SOURCE.indexOf('const RELAY_IS_NOT_THE_ANSWER'),
      SOURCE.indexOf('const RELAY_NEUTRAL_CLOSE'),
    );
    expect(reminder).toContain('send_answer_to_asker');
    expect(reminder).toContain('ავტომატურად არაფერი');
  });

  it('still keeps the 11 August distinction: a relay failure is not a lost answer', () => {
    // Ticket 4 items 0A/0AA. The recipient was told four times that their
    // answer could not be delivered when only the contact lookup had failed.
    // That protection is what the false sentence was carrying, and removing
    // the falsehood must not remove it.
    expect(SOURCE).toContain('პასუხი დაიკარგა');
    expect(SOURCE).toContain('არაფერი დაკარგულა');
  });

  it('puts the reminder on the SUCCESS path too — that is the one that failed', () => {
    // Every warning was on a failure branch, so the run that relayed
    // successfully was told nothing. A relay that works is exactly when it is
    // easiest to believe the exchange is over.
    const createRelay = SOURCE.slice(
      SOURCE.indexOf('export async function createRelayAsk'),
      SOURCE.indexOf('async function parentStillUnanswered'),
    );
    expect(createRelay).toContain('outcome.sent');
    expect(createRelay).toContain('RELAY_IS_NOT_THE_ANSWER');
    // And only while the answer really is still owed: a model that has already
    // sent it must not be told to send it again.
    expect(createRelay).toContain('parentStillUnanswered');
  });
});
