import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * ROW 249 — A CARD THE OWNER'S ANSWER COULD NOT CHANGE, OFFERED IN THE SAME
 * BREATH AS THE APPROVAL THAT MADE IT MEANINGLESS.
 *
 * Goal 9011, 23 September, 07:31:10, read out of the tester's own trace. One
 * step called `approve_task_plan` with confirmed true AND `present_choices`
 * with „Send both / Send only to Netai Test 1 / Send only to Netai Test 4 /
 * Change the wording". The reply said „Approved. Before I send anything, here
 * are the two exact messages, since this task waits for your yes on each one",
 * and then in the SAME message „Understood, no need for that extra check, your
 * approval covers it." The four buttons stayed on screen. Day one sent the
 * messages, correctly — so the owner was asked to decide something that was
 * already decided and that their answer could not have changed.
 *
 * D119: the plan's approval IS the consent. There is no per-message yes.
 *
 * WHY A WALL AND NOT A SENTENCE. The seat has a prompt fix ready and it is the
 * right one for the wording; this is the thing behind it. The reason is written
 * five times over in `chat.service.ts` already — a sentence in a prompt is not
 * a wall — and the model emitted both calls in ONE step, meaning an order the
 * server does not keep. That is the same concurrency the seat identified in
 * row 249's first diagnosis, where an `ask_contact` raced the approval that was
 * meant to permit it.
 */
const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');

describe('no buttons in the same step as an approval', () => {
  it('decides from the turn, before any tool is dispatched', () => {
    expect(chat).toContain(
      "const approvingThisTurn = toolBlocks.some((b) => b.name === 'approve_task_plan');",
    );
  });

  /**
   * AND THE CARD IS NOT RUN AT ALL, rather than run and its result discarded.
   * `present_choices` is what puts buttons on a real person's screen; dropping
   * the result afterwards would leave them there, which is exactly what the
   * owner of 9011 saw.
   */
  it('never runs the card, instead of undoing it afterwards', () => {
    const at = chat.indexOf('const approvingThisTurn');
    const dispatch = chat.slice(at, at + 500);

    expect(dispatch).toContain("block.name === 'present_choices'");
    expect(dispatch).toContain('choicesRefusedBesideAnApproval(block)');
    // The other branch is the ordinary path, untouched.
    expect(dispatch).toContain('runOneToolBlock(userId, threadId, runId, block, ownerAbsent)');
  });

  /**
   * THE WHOLE TURN, NOT THE MATCHING LABELS. Deciding which cards are
   * „send-per-person" means reading wording, and this file's own history is a
   * list of wordings that drifted. „Was an approval recorded in this same step"
   * is a fact about the turn and cannot drift.
   */
  it('does not try to judge the labels', () => {
    const at = chat.indexOf('function choicesRefusedBesideAnApproval');
    const fn = chat.slice(at, at + 1200);

    expect(fn).not.toMatch(/Send both|Send only|label/i);
  });

  /**
   * IT SAYS WHAT TO DO INSTEAD. A refusal that only refuses leaves the model
   * to invent the next move, and inventing the next move under a just-recorded
   * approval is how the „extra check" sentence got written in the first place.
   */
  it('tells the model what the owner should read instead', () => {
    const at = chat.indexOf('function choicesRefusedBesideAnApproval');
    const fn = chat.slice(at, at + 1200);

    expect(fn).toContain('shown: false');
    expect(fn).toContain('D119');
    expect(fn).toMatch(/one or two sentences/);
  });

  /**
   * AND IT IS A TOOL RESULT, addressed to the call it refuses. A refusal that
   * does not carry the `tool_use_id` is a turn the model cannot complete.
   */
  it('answers the call it refuses', () => {
    const at = chat.indexOf('function choicesRefusedBesideAnApproval');
    const fn = chat.slice(at, at + 1200);

    expect(fn).toContain('tool_use_id: block.id');
    expect(fn).toContain("type: 'tool_result'");
  });
});
