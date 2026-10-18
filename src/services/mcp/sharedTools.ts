import { query } from '../../db/postgres/client';
import { decodeContactRef, encodeContactRef } from './contactRef';
import { scrubDeep, scrubEmailsDeep } from './privacy';
import { AppTool, appInputFrom, connectorOutputOf, takesAnotherNumber } from './appToolShape';
import type { McpToolPayload } from './handlers';

/**
 * #5677 (the founder's D818, 18 Oct): „every change to the app reaches both
 * connectors automatically — one shared source". The connector used to be a
 * hand-kept copy: 64 tools, and about 30 of the app's were missing from it, among
 * them record_who_helped. Now every app tool the connector does not have yet is
 * offered to it as the app defines it (its name, text and schema), and it runs
 * through the app's own handler. A tool added to the app reaches the connector
 * with the next deploy, unless it is named below with the reason it cannot.
 *
 * The connector's own tools (TOOL_TEXTS) keep their own text for now. Folding
 * their wording into the app's is model text and waits for Misho's word (D44).
 */
export const APP_ONLY_TOOLS: ReadonlyMap<string, string> = new Map([
  ['present_choices', 'it draws buttons on the app screen'],
  ['ask_owner_decision', 'it draws a decision card on the app screen'],
  ['web_search', 'Claude and ChatGPT search the web themselves'],
  ['fetch_page', 'Claude and ChatGPT read web pages themselves'],
  ['get_own_contact_number', 'it hands out a number, and the connector never carries one'],
  ['lookup_contact_by_phone', 'it takes a typed number, and the connector never carries one'],
  ['share_contact_number_with_asker', 'it sends a number, and works only inside a question'],
  ['send_answer_to_asker', 'it works only inside a question someone asked the owner (D48)'],
  ['relay_ask', 'it works only inside a question someone asked the owner (D48)'],
  ['get_thread_context', 'it reads the app’s own conversations by thread'],
  ['respond_to_introduction', 'the connector answers requests with its respond_to_request'],
]);

export const SHARED_TOOLS_FLAG = 'connector_shared_tools';
const FLAG_TIMEOUT_MS = 2_000;

/** The switch: off until the tester has compared the connector with the app. */
export async function isSharedToolsEnabled(): Promise<boolean> {
  const result = await query<{ enabled: boolean }>(
    'SELECT enabled FROM app_flags WHERE flag = $1 LIMIT 1',
    [SHARED_TOOLS_FLAG],
    FLAG_TIMEOUT_MS,
  );
  return result.rows[0]?.enabled === true;
}

/** The app tools the connector takes from the app: not its own, not app-only, no other number. */
export function sharedAppTools(
  appTools: readonly AppTool[],
  connectorOwn: ReadonlySet<string>,
): AppTool[] {
  return appTools.filter(
    (tool) =>
      !connectorOwn.has(tool.name) && !APP_ONLY_TOOLS.has(tool.name) && !takesAnotherNumber(tool),
  );
}

export type AppToolRunner = (name: string, input: Record<string, unknown>) => Promise<unknown>;

const FOREIGN_REF = {
  error: 'That contact_ref is not one of yours. Take it from a search result, never invent it.',
};

/** One shared call: refs to numbers in, the app's handler, numbers to refs out, then scrubbed. */
export async function runSharedTool(
  userId: string,
  name: string,
  args: Readonly<Record<string, unknown>>,
  run: AppToolRunner,
): Promise<McpToolPayload> {
  const input = appInputFrom(args, (ref) => decodeContactRef(userId, ref));
  if (input === null) return FOREIGN_REF;
  const result = await run(name, input);
  const outward = connectorOutputOf(result, (phone) => encodeContactRef(userId, phone));
  const clean = scrubEmailsDeep(scrubDeep(outward));
  return typeof clean === 'object' && clean !== null && !Array.isArray(clean)
    ? (clean as McpToolPayload)
    : { result: clean };
}
