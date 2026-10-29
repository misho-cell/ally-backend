import { nameKey } from '../tools/transliterate';

/**
 * #7525 (Misho, 29 Oct: the old key cannot be recovered, „make a new list"):
 * the package's number tokens were made under a retired key, so a person is
 * found again the way the Axel package found its strong ties (README v7,
 * rule 2): the full name members saved a number under, when no other number
 * anywhere carries that name. Pure: names in, the one number per name out.
 */
const MIN_NAME_WORDS = 2;
const MAX_NAME_WORDS = 3;
const MIN_WORD_CHARS = 2;

/** Where a name's number was found; the load report counts each. */
export enum NamePlacement {
  Member = 'placed_by_member_name',
  Phonebook = 'placed_by_phonebook_name',
}

export interface NamedNumber {
  readonly phone: string;
  readonly from: NamePlacement;
}

export interface NamesOnANumber {
  readonly phone: string;
  /** A roster member's own names are whole; a label's are read from its edges. */
  readonly names: readonly string[];
  readonly from: NamePlacement;
}

/**
 * The full names a phonebook label may give: its first or its last two or
 * three words („Giorgi Beridze TBC", „TBC Giorgi Beridze"), and two words in
 * either order („Beridze Giorgi"). A name inside a longer label is not read:
 * „Nino Giorgi Beridze" is not Giorgi Beridze's number.
 */
export function labelNameKeys(label: string): string[] {
  const words = nameKey(label)
    .split(' ')
    .filter((w) => w.length >= MIN_WORD_CHARS);
  const keys = new Set<string>();
  for (let n = MIN_NAME_WORDS; n <= Math.min(MAX_NAME_WORDS, words.length); n += 1) {
    for (const part of [words.slice(0, n), words.slice(-n)]) {
      keys.add(part.join(' '));
      if (n === MIN_NAME_WORDS) keys.add([...part].reverse().join(' '));
    }
  }
  return [...keys];
}

/** Each name carried by exactly one number, across the roster and every label; two numbers place nobody. */
export function phonesByUniqueName(numbers: readonly NamesOnANumber[]): Map<string, NamedNumber> {
  const byName = new Map<string, Map<string, NamePlacement>>();
  for (const { phone, names, from } of numbers) {
    for (const key of names) {
      if (key === '') continue;
      const phones = byName.get(key) ?? new Map<string, NamePlacement>();
      // A member's own name outranks a label naming the same number.
      if (phones.get(phone) !== NamePlacement.Member) phones.set(phone, from);
      byName.set(key, phones);
    }
  }
  const unique = new Map<string, NamedNumber>();
  for (const [key, phones] of byName) {
    if (phones.size !== 1) continue;
    const [[phone, from]] = [...phones];
    unique.set(key, { phone, from });
  }
  return unique;
}
