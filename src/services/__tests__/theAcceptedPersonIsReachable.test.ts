import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * ROW 251, THE LAST OF THREE CAUSES — „THE CHANNEL IS OPEN" WAS A SENTENCE THE
 * MODEL COULD NOT ACT ON.
 *
 * The tester's trace, 09:49, after the gate and the recorded number were both
 * already live: the owner typed „Netai Test 4 agreed to put us in touch
 * directly. Write to Netai Test 6 now." The model called
 * search_contact_by_name twice, found nobody — of course it found nobody, not
 * knowing the person is the entire reason there was an introduction — and
 * answered „I have no way to send them a question through the app on your
 * behalf. Do you have their number to share?"
 *
 * No ask_contact. The gate I had built was never reached. What was missing was
 * not permission but a HANDLE: the model could see „accepted, contact handed
 * over" and a name, and a name is not an argument.
 *
 * THE THREE CAUSES, so the row reads honestly: the handover text told people to
 * write themselves (two texts, and I fixed the wrong one first); the gate's own
 * query was dead with an integer-versus-text cast; and nothing gave the model
 * something to pass. All three had to go.
 */
const intro = readFileSync(join(__dirname, '..', 'introduction.service.ts'), 'utf8');
const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
const mcp = readFileSync(join(__dirname, '..', 'mcp', 'handlers.ts'), 'utf8');

describe('an accepted introduction comes back with something to act on', () => {
  it('carries the person and the goal, not just a name', () => {
    expect(intro).toContain('THEN ir.target_phone END AS target_phone');
    expect(intro).toContain('THEN ir.requester_task_id END AS for_goal_id');
  });

  /**
   * ONLY ON AN ACCEPTED, DIRECT INTRODUCTION. `via_mediator` is the mediator
   * deciding to stay in the middle; handing the number over there would undo a
   * choice that is theirs and not the product's. This is the one assertion in
   * the file whose absence would be a privacy fault rather than a bug.
   */
  it('gives nothing away when the mediator kept the connection', () => {
    const at = intro.indexOf('THEN ir.target_phone END AS target_phone');
    const clause = intro.slice(at - 140, at + 60);

    expect(clause).toContain("ir.status = 'accepted'");
    expect(clause).toContain("ir.intro_channel = 'direct'");
  });
});

describe('and each surface names the person the way that surface may', () => {
  /**
   * THE CONNECTOR GETS A REF, NEVER A NUMBER. „Numbers never reach you —
   * stripped" is the promise its own instructions make to it; the in-app model
   * has always been given phones.
   */
  it('turns the phone into an opaque ref for the connector', () => {
    const at = mcp.indexOf('export async function mcpGetIntroStatus');
    const fn = mcp.slice(at, at + 1400);

    expect(fn).toContain('encodeContactRef(userId, target_phone)');
    // Destructured out, so the raw number cannot ride along by accident.
    expect(fn).toContain('const withRefs = introductions.map(({ target_phone, ...rest })');
  });

  /**
   * AND THE MODEL IS TOLD THE HANDLE EXISTS. The tool returning a field nobody
   * mentions is the same failure one layer along — the model searched the
   * phonebook because nothing said it did not have to.
   */
  it('tells the model to use it rather than search for the person', () => {
    const at = chat.indexOf("name: 'get_intro_status'");
    const description = chat.slice(at, at + 3200);

    expect(description).toContain('target_phone');
    expect(description).toContain('for_goal_id');
    expect(description).toContain('Do NOT search the phonebook for them first');
    expect(description).toContain('do NOT ask the owner for a number');
  });

  /**
   * AND IT SAYS WHY, because a rule without its reason is one the next reader
   * deletes: the owner will not have the number, and that is the whole reason
   * they asked for an introduction.
   */
  it('gives the reason and not only the instruction', () => {
    const at = chat.indexOf("name: 'get_intro_status'");

    expect(chat.slice(at, at + 3200)).toContain('which is the whole reason they asked');
  });
});
