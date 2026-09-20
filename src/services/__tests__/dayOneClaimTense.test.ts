import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Thread 18910, 19 September, read from `tool_call_log` and `conversations`
 * side by side. Six seconds:
 *
 *   19:24:44  ask_contact refused — „Nothing sent, and nothing is needed from
 *              you: you approved the plan in this same turn, and day one is
 *              already starting behind your reply…"
 *   19:24:50  „Got it, I'm on it. I've SENT the ask to Netai Test 1 and Netai
 *              Test 3 about helping move the sofa in Tbilisi next weekend…"
 *
 * `task_asks` on that goal: zero rows then, zero rows now.
 *
 * THE MODEL WAS NOT IGNORING THE REFUSAL, it was summarising it. „Day one is
 * already starting" and „tell the owner you are on it" both describe a send in
 * hand, and „I've sent" is what that sounds like written down. The refusal
 * asked for the sentence and did not say which tense to write it in.
 *
 * Same shape as row 208's fix and the same two halves: forbid the wrong word
 * BY NAME, and supply the sentence to write instead — because a refusal that
 * only forbids leaves nothing to write, and the model writes the forbidden
 * thing anyway.
 *
 * Read as text, deliberately: this string is consumed by a model and there is
 * no return value to assert on. The failure mode was a tense, so the test
 * reads words.
 */
const SOURCE = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
/**
 * Joined back up before it is read. Prettier decides where this string wraps,
 * so a phrase that fits on one line today straddles `' +` tomorrow and the
 * test fails on a reformat rather than on a rule — which is the way a
 * source-reading test goes bad.
 */
const REFUSAL = SOURCE.slice(
  SOURCE.indexOf("if (runApprovedAPlan.has(runId ?? '')) {"),
  SOURCE.indexOf('const askOutcome = await createAsk('),
).replace(/'\s*\+\s*'/g, '');

describe('what the day-one guard tells the model to say', () => {
  it('still says the true thing: nothing went out and day one will do it', () => {
    expect(REFUSAL).toContain('Nothing sent');
    expect(REFUSAL).toContain('day one is already starting behind your reply');
  });

  it('forbids the past tense BY NAME, in the words the model actually used', () => {
    expect(REFUSAL).toContain('DO NOT SAY IT HAS BEEN SENT');
    // The three the run produced or could produce next.
    expect(REFUSAL).toContain('I have written to them');
    expect(REFUSAL).toContain('I have sent the question');
    expect(REFUSAL).toContain('I asked them');
  });

  it('says WHY, so the rule survives a paraphrase', () => {
    // „False when written even if it becomes true a minute later" is the whole
    // of D343 rule C in one clause, and it is what stops the model reasoning
    // that the send is about to happen anyway.
    expect(REFUSAL).toContain('false when written');
  });

  it('hands over a sentence to write, rather than only taking one away', () => {
    expect(REFUSAL).toContain('I am writing to X');
    // Present tense, in progress — the shape the product already gets right
    // when the tool refuses in the same breath (21:51:13, „writing … now").
    expect(REFUSAL).toMatch(/I am on it/);
  });
});
