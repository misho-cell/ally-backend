/**
 * Misho, 14 Nov (screenshot): the reply wrote „ტორნიკეს ასისტენტს…" for a
 * contact saved as „tornike abuladze". The model sees the Latin label and
 * guesses: Latin t is თ or ტ, k is კ, ქ or ყ, p is პ or ფ, ts/c is ც or წ, ch is
 * ჩ or ჭ. Where the server is sure of the name's spelling
 * (sureGeorgianNameWords), a word of the reply that is the same name by its
 * Latin sound takes that spelling, its case ending kept („ტორნიკეს" →
 * „თორნიკეს"). Only those letters ever change, so no other word is touched.
 */
const SAME_LATIN_LETTER: Readonly<Record<string, string>> = {
  ტ: 'თ',
  ქ: 'კ',
  ყ: 'კ',
  ფ: 'პ',
  წ: 'ც',
  ჭ: 'ჩ',
};
const GEORGIAN_WORD_RE = /\p{Script=Georgian}+/gu;
/** A case ending drops a name's last vowel: ორთოიძე → ორთოიძის. */
const FINAL_VOWEL_RE = /[აეიოუ]$/u;
/** Shorter stems („ნინ") would catch ordinary words. */
const MIN_STEM_LETTERS = 4;

function byLatinSound(word: string): string {
  return [...word].map((letter) => SAME_LATIN_LETTER[letter] ?? letter).join('');
}

interface KnownStem {
  readonly stem: string;
  readonly sound: string;
}

/** The part of each known name every case form keeps, longest first. */
function knownStems(names: readonly string[]): KnownStem[] {
  const stems = new Set(names.map((name) => name.replace(FINAL_VOWEL_RE, '')));
  return [...stems]
    .filter((stem) => [...stem].length >= MIN_STEM_LETTERS)
    .sort((a, b) => b.length - a.length)
    .map((stem) => ({ stem, sound: byLatinSound(stem) }));
}

/** The reply with each name the server is sure of spelled that way. */
export function withNamesSpelledAsKnown(text: string, sureWords: readonly string[]): string {
  const stems = knownStems(sureWords);
  if (stems.length === 0) return text;
  return text.replace(GEORGIAN_WORD_RE, (word: string) => {
    const sound = byLatinSound(word);
    const known = stems.find((k) => sound.startsWith(k.sound));
    return known === undefined ? word : known.stem + word.slice(known.stem.length);
  });
}
