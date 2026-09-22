import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * TWO GUARDS THAT HOLD BACK A RUN NOBODY WANTS ANY MORE, AND NEITHER IS HELD.
 *
 * Second sabotage sweep, 22 September, this time on MULTI-LINE guards — the
 * condition of `if (cond) {` replaced with `false`, which is exactly „this
 * guard never fires" and always compiles. The single-line sweep could not
 * reach these, and they are where the refusals live.
 *
 * 1. `chat.service.ts` — `if (runWasStopped(threadId, runId))` inside
 *    `runOneToolBlock`. The owner pressed stop; every tool the run still tries
 *    is refused. Its own comment says why it is TOTAL rather than a list: „a
 *    stopped run is refused EVERY tool, with no list to keep in step with the
 *    sixty that exist." Without it a stopped run can still call `ask_contact`,
 *    and the thing the owner stopped goes out to real people anyway.
 *
 * 2. `threads.routes.ts` — `if (isDraining())` on the chat route. Row 205: the
 *    server is going away, so a run started now would be killed before it
 *    answered, and the owner is told THAT rather than „please try again",
 *    which blames them for our deploy. `wakeTask`'s half of this is held by
 *    `noRunStartsInsideAShutdown`; the half a person actually types into was
 *    held by nothing.
 *
 * WHY A SOURCE TEST. `runOneToolBlock` is not exported and there is no HTTP
 * harness in this suite, so driving either one means opening the hottest path
 * in the product to test something that is correct today. That is the trade
 * `theModerationVerdictIsObeyed` and `connectorCallsAreLogged` already make
 * here. It is weaker than behaviour and it is not nothing: each assertion
 * fails the day its line goes.
 */
const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
const threadsRoute = readFileSync(
  join(__dirname, '..', '..', 'api', 'routes', 'threads.routes.ts'),
  'utf8',
);

describe('a run the owner stopped is refused every tool it still tries', () => {
  it('finds the guard at all', () => {
    // Without this the assertions below would pass vacuously over a file that
    // had been restructured out from under them.
    expect(chat).toContain('if (runWasStopped(threadId, runId)) {');
  });

  /**
   * TOTAL, not a list. Sixty tools exist; a list of the dangerous ones is a
   * list somebody has to keep in step, and the day it falls behind is the day
   * the tool that got added writes to somebody.
   */
  it('refuses before the tool runs, whatever the tool is', () => {
    const guardAt = chat.indexOf('if (runWasStopped(threadId, runId)) {');
    const executeAt = chat.indexOf('await executeToolCall(', guardAt);

    // The guard is the first thing in runOneToolBlock and `executeToolCall`
    // — the one door all sixty tools go through — comes after it. That
    // ordering IS the „total" the comment promises: nothing is dispatched.
    expect(guardAt).toBeGreaterThan(0);
    expect(executeAt).toBeGreaterThan(guardAt);
    // And nothing between them does any work.
    const between = chat.slice(guardAt, executeAt);
    expect(between).not.toContain('await query(');
  });

  it('answers the model a refusal it can act on, not an empty result', () => {
    expect(chat).toContain('refused: true');
    expect(chat).toContain('მფლობელმა ეს მუშაობა შეაჩერა');
    // „Finish without an answer" — so the run winds up rather than retrying
    // the same call until the wall-clock budget kills it.
    expect(chat).toContain('დაასრულე უპასუხოდ');
  });

  it('says so in the log, naming the tool it refused', () => {
    expect(chat).toContain('refused — the owner stopped the goal');
  });
});

describe('the chat route refuses to start a run into a shutdown', () => {
  it('finds the guard at all', () => {
    expect(threadsRoute).toContain('if (isDraining()) {');
  });

  /**
   * 503 and a MACHINE-READABLE reason. Row 205's point is that the owner is
   * told the server is restarting rather than „try again" — and the app can
   * only say that if it can tell this refusal from every other 503.
   */
  it('answers 503 with the reason the app can read', () => {
    const at = threadsRoute.indexOf('if (isDraining()) {');
    const block = threadsRoute.slice(at, at + 400);

    expect(block).toContain('res.status(503)');
    expect(block).toContain("reason: 'restarting'");
  });

  it('tells the owner it is us and not them', () => {
    const at = threadsRoute.indexOf('if (isDraining()) {');
    const block = threadsRoute.slice(at, at + 400);

    // „the server is updating right now — try again in a few seconds"
    expect(block).toContain('სერვერი ახლა ახლდება');
  });

  /**
   * AND IT REFUSES BEFORE THE RUN EXISTS. A run id minted and then abandoned
   * is a row in the register that never finishes, which is what the reaper
   * spends its time on.
   */
  it('refuses before a run id is minted', () => {
    const guardAt = threadsRoute.indexOf('if (isDraining()) {');
    const runIdAt = threadsRoute.indexOf('const runId = randomUUID();', guardAt);

    expect(runIdAt).toBeGreaterThan(guardAt);
  });
});
