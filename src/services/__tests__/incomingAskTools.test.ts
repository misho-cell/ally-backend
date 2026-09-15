/**
 * Ticket 19 G6 — asked for, built, and overruled in the same evening.
 *
 * ask_main told the recipient's assistant it had „the question and nothing
 * else: no network, no search, no contact records". The run held the full owner
 * toolset, and on thread 15115 it used it: „ვნახავ ეკეს პროფილს", then a
 * paragraph of a third party's employer wrapped around the recipient's one line.
 * A real contradiction between a prompt and the code.
 *
 * G6 asked for the toolset to be cut to eight. I cut it, and said in the same
 * message that I was only fixing half — the PROMPT still handed the run the
 * recipient's own notes and goals by D48, and which half was wrong was not mine
 * to decide. The tester put it to the founder, who ruled on 16 September for
 * D48 in his own words: „I need to have full access to all kind of tools."
 *
 * So the tools came back and ask_main changes instead. What this file asserts
 * is therefore the OPPOSITE of what it asserted an hour ago, on purpose, and
 * the thing that did not move is the one that matters: the boundary.
 */
import { ASKER_FACING_TOOL_NAMES } from '../chat.service';

describe('Ticket 19 G6, after the founder ruled — D48 stands', () => {
  it('the only tools that reach the asker are the two outbound ones', () => {
    expect([...ASKER_FACING_TOOL_NAMES].sort()).toEqual(['relay_ask', 'send_answer_to_asker']);
  });

  it('carries no third channel to the asker under any name', () => {
    const outbound = ASKER_FACING_TOOL_NAMES.filter((name) =>
      /asker|relay|forward|send/.test(name),
    );
    expect(outbound).toHaveLength(2);
  });

  it('names no tool twice', () => {
    expect(new Set(ASKER_FACING_TOOL_NAMES).size).toBe(ASKER_FACING_TOOL_NAMES.length);
  });
});
