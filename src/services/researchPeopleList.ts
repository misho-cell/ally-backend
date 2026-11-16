import { phoneDigits } from './phone';

/**
 * Misho, 16 Nov: „the detailed search must show far more options". Lika asked
 * for a product photographer; her second circle holds 21 photographers, and the
 * full research's second answer said „nobody new". Each level reached the model
 * as raw JSON cut at 4,000 characters, so of fifty people it saw the first ten
 * or so. Every person a level found is now listed in one short line each.
 */

/** A person a search result names, with what the row says about them. */
export interface PersonRow {
  readonly phone: string;
  readonly name: string | null;
  readonly about: string;
}

/** What one line says about a person, at most. */
const ABOUT_CHARS = 160;
/** A field longer than this is a note, not a fact about the person. */
const ABOUT_FIELD_CHARS = 80;
/** The fields the line already gives in its own place. */
const OWN_PLACE_FIELDS: ReadonlySet<string> = new Set(['phone', 'name']);

function isPersonRow(row: Record<string, unknown>): row is Record<string, unknown> & {
  phone: string;
} {
  return typeof row.phone === 'string' && phoneDigits(row.phone) !== '';
}

function nameOf(row: Record<string, unknown>): string | null {
  return typeof row.name === 'string' && row.name.trim() !== '' ? row.name.trim() : null;
}

/** A short word or list of words from a field; null for anything else. */
function shortText(value: unknown): string | null {
  if (typeof value === 'string') {
    const text = value.trim();
    return text !== '' && text.length <= ABOUT_FIELD_CHARS ? text : null;
  }
  if (value === true) return 'yes';
  if (!Array.isArray(value)) return null;
  const items = value
    .map((item: unknown) =>
      item !== null && typeof item === 'object'
        ? nameOf(item as Record<string, unknown>)
        : shortText(item),
    )
    .filter((item): item is string => item !== null);
  return items.length === 0 ? null : items.join(', ');
}

/** What the row says about the person — saved labels, work, who they come through. */
export function aboutOf(row: Record<string, unknown>): string {
  const parts = Object.entries(row)
    .filter(([field]) => !OWN_PLACE_FIELDS.has(field))
    .map(([field, value]) => {
      const text = shortText(value);
      return text === null ? null : `${field}: ${text}`;
    })
    .filter((part): part is string => part !== null);
  const about = parts.join('; ');
  return about.length > ABOUT_CHARS ? `${about.slice(0, ABOUT_CHARS)}…` : about;
}

/** The people a result names at its top: a person's own bridges are told in their line, not listed. */
export function personRowsIn(value: unknown): PersonRow[] {
  const rows: PersonRow[] = [];
  const visit = (node: unknown): void => {
    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }
    if (node === null || typeof node !== 'object') return;
    const row = node as Record<string, unknown>;
    if (isPersonRow(row)) {
      rows.push({ phone: row.phone, name: nameOf(row), about: aboutOf(row) });
      return;
    }
    Object.values(row).forEach(visit);
  };
  visit(value);
  return rows;
}

/** Everyone the results name, once each, in the order of the results given, at most `max`. */
export function peopleListed(results: readonly object[], max: number): PersonRow[] {
  const seen = new Set<string>();
  const listed: PersonRow[] = [];
  for (const person of results.flatMap(personRowsIn)) {
    const digits = phoneDigits(person.phone);
    if (seen.has(digits)) continue;
    seen.add(digits);
    listed.push(person);
    if (listed.length >= max) break;
  }
  return listed;
}

/** One person as the model reads them. */
export function personLine(person: PersonRow): string {
  const about = person.about === '' ? '' : ` — ${person.about}`;
  return `- ${person.name ?? 'unnamed'} (phone id ${person.phone})${about}`;
}
