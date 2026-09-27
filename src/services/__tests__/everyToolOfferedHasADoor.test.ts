jest.mock('../../db/postgres/client', () => ({
  __esModule: true,
  query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
  poolPressure: () => ({ total: 0, idle: 0, waiting: 0 }),
  default: {},
}));
jest.mock('../../config/anthropic', () => ({ __esModule: true, default: {} }));

import { readFileSync } from 'fs';
import { join } from 'path';
import { ALWAYS_ON_TOOLS, getContactInsightTools } from '../chat.service';

/**
 * A TOOL THE MODEL IS OFFERED AND THE SERVER CANNOT RUN.
 *
 * Every tool reaches the model as a schema — `name`, `description`,
 * `parameters` — and is executed by a `switch (name)` in `executeToolCall`.
 * Those are two separate lists that nothing tied together, and there is no
 * failure mode in between: the model calls a name in good faith, the switch
 * falls through, and the person's run spends a turn on it.
 *
 * ⚠️ WHY THIS EXISTS. On 27 September I wrote a guard into
 * `createSaveContactInsightTool`'s `execute` closure, with eleven passing
 * tests, and told two people the tool was fixed. `execute` is never called —
 * only the schema is read, and the live call is the switch arm. The field has
 * since been deleted from `ChatToolDefinition` so the shape cannot mislead
 * anybody again, and this test holds the thing that actually matters: the
 * schema list and the door list are the same list.
 *
 * It reads the source because the dispatcher is a `switch` inside a closure
 * with no seam to call, and asserts the whole `case '<name>':` rather than the
 * name alone — a name on its own appears in the schema too, so a fragment
 * would pass on a tool with no door at all.
 */
const dispatcher = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');

/**
 * The OPTIONAL registry is where a gap is likelier: those tools are switched on
 * per deployment, so one with no door would stay invisible until the day it is
 * enabled. It is not exported, so its keys are read the only way available —
 * the `name:` inside each entry, which is the string the model actually sends.
 */
function namesInTheOptionalRegistry(): string[] {
  const at = dispatcher.indexOf('const ALL_TOOL_DEFINITIONS: Record<string, AnthropicTool> = {');
  const until = dispatcher.indexOf('\n};', at);
  const block = dispatcher.slice(at, until);
  return [...new Set([...block.matchAll(/^ {4}name: '([a-z_]+)',$/gm)].map((m) => m[1]))];
}

const offered = [
  ...ALWAYS_ON_TOOLS.map((t) => t.name),
  ...getContactInsightTools().map((t) => t.name),
  ...namesInTheOptionalRegistry(),
];

describe('every tool offered to the model has a door in the dispatcher', () => {
  it('offers a list worth checking', () => {
    // A parse that quietly matched nothing would make every assertion below
    // vacuous, so the shape of the list is asserted before its contents.
    // Ten, and that is the real number — `buildEnabledTools`' own comment says
    // so ("Ten tools out of..."). The assertion is here to catch a parse that
    // matched nothing, not to pin the registry's size.
    expect(namesInTheOptionalRegistry().length).toBeGreaterThanOrEqual(10);
    expect(offered.length).toBeGreaterThan(40);
    expect(new Set(offered).size).toBe(offered.length);
  });

  it.each(offered)('%s has a case in the switch', (name) => {
    expect(dispatcher).toContain(`case '${name}':`);
  });
});
