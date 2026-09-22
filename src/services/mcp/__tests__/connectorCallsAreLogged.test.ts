import * as fs from 'fs';
import * as path from 'path';

/**
 * A tool call made through the CONNECTOR was never written down at all.
 *
 * The tester's observation, 21 September: `runTool` writes the cost ledger and
 * not `tool_call_log`. It could not write it — `thread_id` was NOT NULL and a
 * connector call has no thread — so the one table that records what a tool
 * actually DID held the chat's half of the product and nothing else.
 *
 * WHAT THAT COST: for three days I took counts out of it and called them
 * „every call". They were every CHAT call. It is the third time in two days
 * that one table showed me a part and I read it as the whole (the way-in
 * searches, the phase rows in the readiness gate, and this).
 *
 * WHY A SOURCE TEST. The registration surface here is sixty-two closures
 * around an MCP server object, and the failure this guards is not „the logging
 * is wrong" but „a tool was added and the wiring was forgotten" — which is the
 * exact bug class `registryParity.test.ts` was written for, one file over. A
 * unit test of `logToolCall` cannot see a caller that never calls it; that is
 * precisely how this survived.
 */
const SOURCE = fs.readFileSync(path.join(__dirname, '..', 'mcpServer.ts'), 'utf8');

/**
 * Comments stripped first, and this is not a formality: the paragraph above
 * `runTool` says „logToolCall" three times. A plain text search over the file
 * would read the documentation and call it code — the same substitution these
 * tests exist to catch, one level up. The inFlightRuns wiring test learned it
 * the hard way and this one inherits the lesson rather than repeating it.
 */
const CODE = SOURCE.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, ' ');

/** Every `runTool(userId, 'name', <args>, () => handler(...))`, as written. */
interface CallSite {
  readonly tool: string;
  readonly argsPassed: string;
  readonly handler: string;
}

function callSites(): CallSite[] {
  const sites: CallSite[] = [];
  const re = /runTool\(userId, '(\w+)',\s*([^,]+?),\s*\(\) =>([\s\S]{0,160}?)\),\s*\n/g;
  let match = re.exec(CODE);
  while (match !== null) {
    sites.push({ tool: match[1], argsPassed: match[2].trim(), handler: match[3] });
    match = re.exec(CODE);
  }
  return sites;
}

describe('every connector call reaches the log', () => {
  /**
   * „I could not look" is not „there is nothing there", and over a list this
   * is the whole risk: every test below is vacuously true over an empty one,
   * and quietly weaker over a short one. So the parse is held to the file's
   * own count rather than to a floor — a call site written in a shape the
   * regex does not know fails HERE, where it is visible, instead of being
   * silently left out of the checks underneath.
   */
  it('parses every call site in the file, not merely some of them', () => {
    const everyOne = SOURCE.match(/runTool\(userId, '\w+'/g) ?? [];

    expect(everyOne.length).toBeGreaterThan(50);
    expect(callSites().length).toBe(everyOne.length);
  });

  it('runTool writes the log and not only the ledger', () => {
    expect(CODE).toContain('logToolCall(');
    expect(CODE).toContain("surface: 'connector'");
  });

  /**
   * The row is written whichever way the call ends. A log holding only the
   * calls that worked answers „how often does this fail" with silence.
   */
  it('records the failure path too, not just the success', () => {
    const body = CODE.slice(
      CODE.indexOf('async function runTool'),
      CODE.indexOf('const READ_ONLY'),
    );
    expect(body).toContain('record(payload)');
    expect(body).toContain('catch (err)');
    // The thrown error is recorded as an error, not dropped on the way past.
    expect(/catch \(err\)[\s\S]*record\(\{ error:/.test(body)).toBe(true);
  });

  it('no thread and no run, because a connector call belongs to neither', () => {
    expect(CODE).toContain('threadId: null');
  });

  /**
   * THE ONE A COPY-PASTE WILL GET WRONG. A new tool registered as
   * `runTool(userId, 'x', {}, () => handler(userId, args))` compiles, runs,
   * costs the owner the same money — and writes an empty `args_summary`, which
   * reads exactly like a call that was passed nothing. A column that cannot
   * tell „nothing was passed" from „we did not write it down" is worse than no
   * column at all.
   */
  it('a tool whose handler takes arguments passes those arguments to the log', () => {
    const wrong = callSites()
      .filter((site) => /\bargs\b/.test(site.handler) && site.argsPassed !== 'args')
      .map((site) => `${site.tool} passes ${site.argsPassed}`);

    expect(wrong).toEqual([]);
  });

  it('and a tool that takes none says so, rather than naming something it has not got', () => {
    const wrong = callSites()
      .filter((site) => !/\bargs\b/.test(site.handler) && site.argsPassed !== '{}')
      .map((site) => `${site.tool} passes ${site.argsPassed}`);

    expect(wrong).toEqual([]);
  });
});
