/**
 * Ticket 19 item 0 — the model approved its own plan.
 *
 * Reported 15 Sep and true. A silent-day wake on goal #2872 called
 * approve_task_plan itself, wrote „გეგმა დამტკიცდა v2" on the timeline one
 * minute after the wake, and went on to ask two real people in the founder's
 * name. They were spared only because neither had ever opened Netai — not by
 * anything in the code.
 *
 * The gate that existed asked the model whether the user had said yes
 * (`confirmed !== true`). In a chat that is at least a question about
 * something that happened. In a wake there is nobody in the room to have said
 * it, so the flag is the model's own word about a conversation that never took
 * place — and it said yes.
 *
 * These tests fix the shape of the answer: in a run the owner did not start,
 * the two consent tools are NOT OFFERED, and a call to one anyway is refused.
 */
import { OWNER_CONSENT_TOOL_NAMES, RUN_EVENT_PREFIX, toolsForRun } from '../chat.service';

/**
 * The marker that separates a person's line from the engine's own.
 *
 * It is not a new flag invented for this fix — the thread already files a turn
 * beginning with it as an `event` rather than a `message`, precisely because
 * nobody typed it. Reusing it means the two answers cannot drift apart.
 */
describe('a wake is not a conversation', () => {
  it('marks an engine event as a run the owner is not in', () => {
    const wake = `${RUN_EVENT_PREFIX} მფლობელმა ერთი დღეა არ უპასუხა კითხვას`;
    expect(wake.startsWith(RUN_EVENT_PREFIX)).toBe(true);
  });

  it('does not mark a line the owner actually typed', () => {
    // The founder's own approval on 14 Sep sat next to his own line in the
    // thread. That is what a real yes looks like and it must stay unaffected.
    expect('კი, დამტკიცებულია'.startsWith(RUN_EVENT_PREFIX)).toBe(false);
    expect('მჭირდება კარგი ვეტერინარი თბილისში'.startsWith(RUN_EVENT_PREFIX)).toBe(false);
  });

  it('is not fooled by the words appearing later in a sentence', () => {
    // A person quoting the marker is still a person writing.
    expect(`ეს რას ნიშნავს — ${RUN_EVENT_PREFIX}?`.startsWith(RUN_EVENT_PREFIX)).toBe(false);
  });
});

describe('the tool list a wake run holds', () => {
  const FULL = [
    { name: 'search_contacts' },
    { name: 'propose_task_plan' },
    { name: 'approve_task_plan' },
    { name: 'grant_task_permission' },
    { name: 'ask_contact' },
  ];

  it('has no approve and no grant — the condition the report asked for', () => {
    const names = toolsForRun(FULL, true).map((t) => t.name);

    expect(names).not.toContain('approve_task_plan');
    expect(names).not.toContain('grant_task_permission');
  });

  it('still proposes, still searches, still asks', () => {
    // The wake is not crippled: it may do everything except decide, on the
    // owner's behalf, that the owner agreed. A plan can still be written and
    // offered — it simply stays proposed.
    const names = toolsForRun(FULL, true).map((t) => t.name);

    expect(names).toContain('propose_task_plan');
    expect(names).toContain('search_contacts');
    expect(names).toContain('ask_contact');
  });

  it('leaves a real conversation untouched', () => {
    // When the owner is the one writing, both tools are there — that is how a
    // yes gets recorded at all.
    expect(toolsForRun(FULL, false)).toHaveLength(FULL.length);
    expect(toolsForRun(FULL, false).map((t) => t.name)).toContain('approve_task_plan');
  });

  it('names exactly the two tools that record the owner speaking', () => {
    // A closed set, written down: the next tool that records consent has to be
    // added here deliberately rather than inherited by accident.
    expect([...OWNER_CONSENT_TOOL_NAMES].sort()).toEqual([
      'approve_task_plan',
      'grant_task_permission',
    ]);
  });
});
