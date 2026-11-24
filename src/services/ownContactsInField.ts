import { phoneDigits } from './phone';

/**
 * Misho, 24 Nov: „the search answer names three to five ways in. Then let it
 * run over my own contacts too, and show everyone there with any tie to this
 * field — these people are also in your contacts, could they interest you?"
 *
 * The full research already found them: its own-contacts levels list every
 * contact saved under the request's words (or words of the same meaning) and
 * every contact the owner's own notes tie to it. The answer names only the best
 * few. This takes the rest, strongest tie first, each with one reason built
 * from what the owner can see — never another person's label.
 */

/** Why a contact is in the list, as the card says it. */
export enum OwnTieKind {
  /** The owner's own label for them. */
  Label = 'label',
  /** The work their own profile states. */
  Work = 'work',
  /** A note the owner saved about them. */
  Note = 'note',
  /** Only other people's phones tie them to this; their words are not quoted. */
  OthersLabels = 'others',
  /** Found, with nothing about them that may be said (their own self-description). */
  Plain = 'plain',
}

export interface OwnTie {
  readonly kind: OwnTieKind;
  /** What is shown after the reason; empty for the kinds that quote nothing. */
  readonly value: string;
}

export interface OwnContactInField {
  readonly phone: string;
  readonly name: string;
  readonly tie: OwnTie;
  /** How many of the research's own-contact searches found them. */
  readonly hits: number;
}

/** A tag shown in the reason, at most this many. */
const MAX_TAGS_SHOWN = 2;
/** A word's first letters that must appear in a tag for it to be the matching one. */
const STEM_LETTERS = 4;
/** A reason longer than this is cut: it is one line. */
const MAX_REASON_CHARS = 80;
/** An owner's hidden note is matched, never shown (searchByInsight writes this). */
const HIDDEN_NOTE_MARK = '[';

type Row = Readonly<Record<string, unknown>>;

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
}

function texts(value: unknown): string[] {
  return Array.isArray(value) ? value.map(text).filter((t): t is string => t !== null) : [];
}

function clipped(value: string): string {
  return value.length > MAX_REASON_CHARS ? `${value.slice(0, MAX_REASON_CHARS)}…` : value;
}

/** The phone a row is about: the tag search says `phone`, the notes search `contact_id`. */
function phoneOf(row: Row): string | null {
  const phone = text(row.phone) ?? text(row.contact_id);
  return phone !== null && phoneDigits(phone) !== '' ? phone : null;
}

/** The people at a result's top; a person's own bridges are theirs, not listed. */
export function personRecordsIn(value: unknown): Row[] {
  const rows: Row[] = [];
  const visit = (node: unknown): void => {
    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }
    if (node === null || typeof node !== 'object') return;
    const row = node as Row;
    if (phoneOf(row) !== null) {
      rows.push(row);
      return;
    }
    Object.values(row).forEach(visit);
  };
  visit(value);
  return rows;
}

/** Someone the owner holds: not a number that only holds the owner, nor a note about a stranger. */
export function isOwnContact(row: Row): boolean {
  if (row.they_saved_you === true) return false;
  if ('in_your_contacts' in row) return row.in_your_contacts === true;
  if ('matched' in row) return false;
  return true;
}

/** The request's words cut to their first letters, so a tag in another form still matches. */
export function stemsOf(words: string): string[] {
  return [
    ...new Set(
      words
        .toLocaleLowerCase()
        .split(/[\s,.;:!?„"“”()]+/u)
        .filter((w) => [...w].length >= STEM_LETTERS)
        .map((w) => [...w].slice(0, STEM_LETTERS).join('')),
    ),
  ];
}

/** The owner's tags that carry one of the words first, else the first tags. */
function tagsShown(tags: readonly string[], stems: readonly string[]): string[] {
  const matching = tags.filter((t) => stems.some((s) => t.toLocaleLowerCase().includes(s)));
  return (matching.length > 0 ? matching : tags).slice(0, MAX_TAGS_SHOWN);
}

/** One reason a contact is here, from what the owner may see. */
export function tieOf(row: Row, stems: readonly string[]): OwnTie {
  if (row.found_by_their_own_work !== undefined) return { kind: OwnTieKind.Plain, value: '' };
  const notes = texts(row.matched).filter((n) => !n.startsWith(HIDDEN_NOTE_MARK));
  if (notes.length > 0) return { kind: OwnTieKind.Note, value: clipped(notes[0]) };
  const tags = texts(row.tags);
  if (row.found_by_others_labels !== true && tags.length > 0) {
    return { kind: OwnTieKind.Label, value: clipped(tagsShown(tags, stems).join(', ')) };
  }
  const work = [text(row.jobPosition), text(row.employer)].filter((w): w is string => w !== null);
  if (work.length > 0) return { kind: OwnTieKind.Work, value: clipped(work.join(', ')) };
  if (row.found_by_others_labels === true) return { kind: OwnTieKind.OthersLabels, value: '' };
  return { kind: OwnTieKind.Plain, value: '' };
}

/** How much a reason says: the owner's own words first, a bare mention last. */
const TIE_STRENGTH: Readonly<Record<OwnTieKind, number>> = {
  [OwnTieKind.Label]: 4,
  [OwnTieKind.Note]: 3,
  [OwnTieKind.Work]: 2,
  [OwnTieKind.OthersLabels]: 1,
  [OwnTieKind.Plain]: 0,
};

function nameOf(row: Row): string | null {
  return text(row.name) ?? text(row.saved_as);
}

/**
 * Every own contact the research's own-contact results name, once each, ranked
 * by how many searches found them and then by how much their reason says.
 * `left` takes out who the answers already gave or who was written to.
 */
export function ownContactsInField(
  results: readonly object[],
  words: string,
  left: (phone: string, name: string) => boolean,
): OwnContactInField[] {
  const stems = stemsOf(words);
  const byPhone = new Map<string, OwnContactInField>();
  for (const row of results.flatMap(personRecordsIn)) {
    const phone = phoneOf(row);
    const name = nameOf(row);
    if (phone === null || name === null || !isOwnContact(row)) continue;
    const digits = phoneDigits(phone);
    const seen = byPhone.get(digits);
    const tie = tieOf(row, stems);
    const better = seen === undefined || TIE_STRENGTH[tie.kind] > TIE_STRENGTH[seen.tie.kind];
    byPhone.set(digits, {
      phone: seen?.phone ?? phone,
      name: seen?.name ?? name,
      tie: better ? tie : seen.tie,
      hits: (seen?.hits ?? 0) + 1,
    });
  }
  return [...byPhone.values()]
    .filter((c) => left(c.phone, c.name))
    .sort((a, b) => b.hits - a.hits || TIE_STRENGTH[b.tie.kind] - TIE_STRENGTH[a.tie.kind]);
}

// ── The card ─────────────────────────────────────────────────────────────────

export const OWN_CONTACTS_KIND = 'own_contacts_in_field';
/** Misho, 24 Nov: „10 is enough", in the app and in WhatsApp alike. */
export const MAX_OWN_CONTACTS_SHOWN = 10;
/** Who the „show them all" answer may still list. */
const MAX_OWN_CONTACTS_KEPT = 60;
/** A name shorter than this is not looked for in the reply: it would match inside words. */
const MIN_NAME_CHARS = 3;

/** Whether the reply already names this person. */
export function replyNames(reply: string, name: string): boolean {
  const lower = name.toLocaleLowerCase();
  return [...lower].length >= MIN_NAME_CHARS && reply.toLocaleLowerCase().includes(lower);
}

function contactPayload(contact: OwnContactInField): Record<string, unknown> {
  return { name: contact.name, tie: contact.tie.kind, value: contact.tie.value };
}

/** The research's contacts as a pending item, before the reply is known. */
export function ownContactsItem(contacts: readonly OwnContactInField[]): {
  kind: string;
  task_id: null;
  payload: Record<string, unknown>;
} | null {
  if (contacts.length === 0) return null;
  return {
    kind: OWN_CONTACTS_KIND,
    task_id: null,
    payload: { contacts: contacts.slice(0, MAX_OWN_CONTACTS_KEPT).map(contactPayload) },
  };
}

/**
 * The card once the reply is written: who it named comes off, ten are shown,
 * and the count of the rest rides with them. Null when nobody is left.
 */
export function ownContactsAfterReply(
  payload: Record<string, unknown>,
  reply: string,
): Record<string, unknown> | null {
  const contacts = Array.isArray(payload.contacts)
    ? (payload.contacts as Record<string, unknown>[])
    : [];
  const left = contacts.filter((c) => {
    const name = text(c.name);
    return name !== null && !replyNames(reply, name);
  });
  if (left.length === 0) return null;
  return {
    contacts: left.slice(0, MAX_OWN_CONTACTS_SHOWN),
    rest: left.slice(MAX_OWN_CONTACTS_SHOWN),
  };
}
