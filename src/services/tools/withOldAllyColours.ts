import { coloursAndBubbles, PersonColours } from '../oldAllyColours.service';
import { phoneDigits } from '../phone';

/**
 * #5974 (founder's Priority 1, "my bubble"): every person-finding tool's rows
 * carry the owner's own old-Ally colour and the person's bubble, read for the
 * whole page in one batch after the tool has run.
 */
export const OLD_ALLY_COLOUR_TOOLS: ReadonlySet<string> = new Set([
  'search_contact_by_name',
  'search_by_tag',
  'search_second_degree',
  'get_contact_full_profile',
  'find_warm_path',
]);

const WARM_PATH_TOOL = 'find_warm_path';
const PROFILE_TOOL = 'get_contact_full_profile';

/** Served beside the rows whenever one of them has a colour or a bubble to say. */
export const COLOUR_NOTE =
  "owner_colour is the OWNER's own old-Ally colour for this person — green is the closest, then " +
  'blue, yellow, red; absent means the owner never coloured them. bubble.count is how many of the ' +
  "owner's OWN green and blue people hold this person green or blue too: when it is above zero, " +
  'say it plainly, e.g. „3 of your closest people hold him close", and name bubble.closest — the ' +
  "owner's own names for them. Never say what colour any other member gave anybody, and never a " +
  'colour for a named bridge: they "hold him close", nothing finer. A colour_why on a bridge is ' +
  'the reason it comes first; say it in those words.';

type Row = Record<string, unknown>;

function isRow(value: unknown): value is Row {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function phoneOf(row: Row): string | null {
  return typeof row.phone === 'string' && row.phone !== '' ? row.phone : null;
}

/** The per-person rows of one tool's result. */
export function personRows(toolName: string, result: Row): Row[] {
  if (toolName === PROFILE_TOOL) return [result];
  if (toolName === WARM_PATH_TOOL) return isRow(result.target) ? [result.target] : [];
  return Array.isArray(result.results) ? result.results.filter(isRow) : [];
}

function decorated(row: Row, colours: ReadonlyMap<string, PersonColours>): Row {
  const phone = phoneOf(row);
  const found = phone === null ? undefined : colours.get(phoneDigits(phone));
  return found === undefined
    ? row
    : { ...row, owner_colour: found.owner_colour, bubble: found.bubble };
}

function hasSomethingToSay(colours: ReadonlyMap<string, PersonColours>): boolean {
  return [...colours.values()].some((c) => c.owner_colour !== null || c.bubble.count > 0);
}

/** The result with every person-row decorated, in the tool's own shape. */
export function applyColours(
  toolName: string,
  result: Row,
  colours: ReadonlyMap<string, PersonColours>,
): Row {
  const dress = (row: Row): Row => decorated(row, colours);
  const note = hasSomethingToSay(colours) ? { colour_note: COLOUR_NOTE } : {};
  if (toolName === PROFILE_TOOL) return { ...dress(result), ...note };
  if (toolName === WARM_PATH_TOOL) {
    return isRow(result.target) ? { ...result, target: dress(result.target), ...note } : result;
  }
  if (!Array.isArray(result.results)) return result;
  return { ...result, results: result.results.map((r) => (isRow(r) ? dress(r) : r)), ...note };
}

/**
 * The tool's result with colours and bubbles added. A failed read leaves the
 * result exactly as the tool gave it: the colours are an addition, never a
 * reason a search fails.
 */
export async function withOldAllyColours(
  userId: string,
  toolName: string,
  result: unknown,
): Promise<unknown> {
  if (!OLD_ALLY_COLOUR_TOOLS.has(toolName) || !isRow(result)) return result;
  const phones = personRows(toolName, result)
    .map(phoneOf)
    .filter((p): p is string => p !== null);
  if (phones.length === 0) return result;
  try {
    return applyColours(toolName, result, await coloursAndBubbles(userId, phones));
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(`[old-ally-colours] ${toolName}: not added:`, (err as Error).message);
    return result;
  }
}
