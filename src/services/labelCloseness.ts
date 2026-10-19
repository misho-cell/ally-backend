/**
 * #5974 world C (the tester's 68815, 0 of 3): „which of my friends is closest
 * to Zviad?" — three friends hold him, saved as „ზვიად ბერიძე ბიძაშვილი"
 * (cousin), „ზვიად ბერიძე ძმაკაცი" (buddy) and plain „ზვიად ბერიძე". None of
 * them has an old-Ally colour for him, so every link weighed the same and the
 * answer was „all three links equal". The words a member put in their own
 * label of a person say how close they are: kin before friend before nothing.
 *
 * Matched per word, never as a substring: „ძმაკაცი" (buddy) holds „ძმა"
 * (brother), and a buddy is a friend, not family. „და" (sister) is left out:
 * it is also „and", as in „ნინო და გიო".
 */
export enum LabelTie {
  None = 0,
  Friend = 1,
  Kin = 2,
}

/** Whole words only — short enough to sit inside other words. */
const KIN_WORDS: ReadonlySet<string> = new Set([
  'ძმა',
  'დაიკო',
  'დედა',
  'მამა',
  'ბებია',
  'ბაბუა',
  'პაპა',
  'ცოლი',
  'ქმარი',
  'შვილი',
  'ბიძა',
  'დეიდა',
  'მამიდა',
  'ნათლია',
  'brother',
  'sister',
  'mother',
  'father',
  'mom',
  'dad',
  'wife',
  'husband',
  'son',
  'daughter',
  'uncle',
  'aunt',
]);

/** The start of a word, so a case ending still counts („ბიძაშვილს"). */
const KIN_STEMS: readonly string[] = [
  'ბიძაშვილ',
  'დეიდაშვილ',
  'მამიდაშვილ',
  'ძმისშვილ',
  'დისშვილ',
  'ნათესავ',
  'cousin',
  'relative',
  'nephew',
  'niece',
];

const FRIEND_STEMS: readonly string[] = [
  'ძმაკაც',
  'მეგობარ',
  'დაქალ',
  'ბავშვობის',
  'friend',
  'buddy',
  'bestie',
  'bff',
];

const WORD_SPLIT_RE = /[^\p{L}\p{M}]+/u;
const CLOSE_EMOJI_RE = /[♥❤💕💖🥰😍💗💓💞💝❣]/u;

function wordsOf(label: string): string[] {
  return label
    .toLowerCase()
    .split(WORD_SPLIT_RE)
    .filter((word) => word !== '');
}

function startsWithAny(word: string, stems: readonly string[]): boolean {
  return stems.some((stem) => word.startsWith(stem));
}

function tieOfOne(label: string): LabelTie {
  const words = wordsOf(label);
  if (words.some((word) => KIN_WORDS.has(word) || startsWithAny(word, KIN_STEMS))) {
    return LabelTie.Kin;
  }
  if (words.some((word) => startsWithAny(word, FRIEND_STEMS)) || CLOSE_EMOJI_RE.test(label)) {
    return LabelTie.Friend;
  }
  return LabelTie.None;
}

/** The closest tie any of one member's labels of a person says. */
export function labelTie(labels: readonly string[]): LabelTie {
  return labels.reduce<LabelTie>((best, label) => Math.max(best, tieOfOne(label)), LabelTie.None);
}
