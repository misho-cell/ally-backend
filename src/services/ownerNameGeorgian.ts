import { GEORGIAN_FIRST_NAMES } from './georgianFirstNames';
import { georgianToLatin, hasGeorgian } from './tools/transliterate';

/**
 * Ticket 20 row 146, found 1 — the owner's name, spelled the same way twice.
 *
 * The seat read goal 3895 and found the saved plan calling the founder
 * „ტორნიკეს" in its solved-when line while the reply above it said
 * „თორნიკეს". One person, two spellings, on the text he is being asked to
 * approve.
 *
 * NEITHER SPELLING COMES FROM US. His account stores „Tornike Abuladze" in
 * Latin, and the prompt hands the model exactly that. Every Georgian rendering
 * of it on a screen was transliterated by a model, on the spot, and `t` is
 * two different Georgian letters — თ and ტ. Nothing chose wrong; nothing
 * chose at all. And since row 129 two different models write in one thread,
 * so the two halves of one goal do not even have the same guesser.
 *
 * THE LIST ALREADY KNEW. georgianFirstNames.ts holds 275 Georgian-script first
 * names taken from this base's real labels, and transliterating all of them
 * produces 275 distinct Latin keys — not one collision. The ambiguity only
 * runs one way: თ and ტ both give „t", but only ONE of თორნიკე and ტორნიკე is
 * a name people are actually called, and the list is the record of which.
 *
 * So the lookup is exact rather than clever, and a name the list does not hold
 * produces nothing rather than a guess. A wrong spelling asserted by the
 * server would be worse than the inconsistency it replaces: the model at least
 * varies, while a bad row would be wrong in the same way every time.
 */

/**
 * Latin key → the Georgian spelling, built once from the names list.
 *
 * Lazy, because this costs a pass over 1,300 entries and most processes that
 * import this module never render a prompt.
 */
let reverseIndex: Map<string, string> | null = null;

function index(): Map<string, string> {
  if (reverseIndex !== null) return reverseIndex;
  const built = new Map<string, string>();
  for (const name of GEORGIAN_FIRST_NAMES) {
    if (!hasGeorgian(name)) continue;
    const key = georgianToLatin(name);
    // First writer wins, and nothing in the list currently collides. If a
    // future addition does, the entry is dropped rather than resolved by
    // insertion order — an arbitrary winner is the one outcome worse than no
    // answer, because it would spell somebody's name wrong consistently.
    if (built.has(key) && built.get(key) !== name) built.set(key, '');
    else built.set(key, name);
  }
  reverseIndex = built;
  return built;
}

/** Tests, and anything that reloads the names list. */
export function resetGeorgianNameIndex(): void {
  reverseIndex = null;
}

/**
 * The Georgian spelling of a registered name's FIRST name, or null.
 *
 * Null for: a name already written in Georgian, an empty name, and a first
 * name the list does not hold. Only the first name is answered — surnames are
 * not in the list, and „Abuladze" would have to be transliterated by rule,
 * which is the guess this exists to avoid.
 */
export function georgianFirstNameOf(registeredName: string): string | null {
  const trimmed = registeredName.trim();
  if (trimmed === '' || hasGeorgian(trimmed)) return null;
  const first = trimmed.split(/\s+/)[0]?.toLowerCase() ?? '';
  if (first === '') return null;
  const found = index().get(first);
  return found === undefined || found === '' ? null : found;
}

/**
 * The line that goes under the registered name in the prompt.
 *
 * It names the SPELLING and says nothing about which script to write in: that
 * is rule 16's business and the language the owner is writing in, and a second
 * instruction about it here would be two rules on one question. Empty when
 * there is nothing to say, so a prompt gains no line it does not need.
 */
export function georgianSpellingNote(registeredName: string): string {
  const georgian = georgianFirstNameOf(registeredName);
  return georgian === null
    ? ''
    : `\nქართულად სახელი ასე იწერება: ${georgian}. ` +
        'თუ ქართულად წერ, ყოველთვის ზუსტად ასე დაწერე — არც ერთ ტექსტში სხვაგვარად.';
}
