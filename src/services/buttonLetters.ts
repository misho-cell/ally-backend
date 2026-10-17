/**
 * Task #367 — Ninia's test 8 (thread 30140, 07:46:28Z): a button read
 * „დიაႮ, გაეგზავნო თორნიკესთვის". The model wrote „Ⴎ", an old-script
 * (asomtavruli) capital, inside „დიახ". The prompt now says buttons are read
 * letter by letter; the tester asked for a guard that binds better (1027).
 *
 * A button is something the owner presses, so a letter no modern reader can
 * read has no place on it. These are the scripts that turn up as such slips:
 * Georgian asomtavruli and nuskhuri, which look like Georgian and are not what
 * anyone types today, and Armenian, whose letters sit beside them and look
 * close enough to pass at a glance. Mtavruli (modern Georgian capitals) is not
 * here: the storage scrub already writes it as Mkhedruli.
 *
 * The tester's 1133 (36599): „ვამტკი჊ებ" — U+10CA, a code point in the
 * Georgian block that has no letter at all, rendered as a broken glyph. The
 * whole old-script tail of the block (U+10A0–U+10CF and U+2D00–U+2D2F) is
 * caught, assigned or not, and so is the replacement character.
 */
const FOREIGN_LETTER_RE = /[Ⴀ-჏ⴀ-⴯�Ա-Ֆա-և]/u;
/**
 * #1486, the tester's 45310 (conv 43544): „სხვა გკ96ა მოვახოთ" — digits inside
 * a Georgian word. A Georgian letter written straight against a digit or a
 * Latin letter is a slip on a button; a number or a name with its Georgian
 * ending takes a hyphen („10-ში", „Netai-ზე") and is not caught.
 */
const MIXED_INTO_GEORGIAN_RE = /(?<=[ა-ჰ])[0-9A-Za-z]|[0-9A-Za-z](?=[ა-ჰ])/u;

/** The first label that carries such a letter, with the letter; null when all are clean. */
export function labelWithForeignLetter(
  labels: readonly string[],
): { readonly label: string; readonly letter: string } | null {
  for (const label of labels) {
    const found = label.match(FOREIGN_LETTER_RE) ?? label.match(MIXED_INTO_GEORGIAN_RE);
    if (found) return { label, letter: found[0] };
  }
  return null;
}

/** What the model is told when it must write the buttons again. */
export function foreignLetterRefusal(found: { label: string; letter: string }): string {
  return (
    `Not shown: the button „${found.label}" has the letter „${found.letter}", which is not a ` +
    'modern Georgian (Mkhedruli) letter — the owner cannot read it on a button. Call ' +
    'present_choices again with every label written in ordinary letters, checked letter by letter.'
  );
}

/**
 * 5347, the tester's 63930 (56071): a Georgian reply ended „…? համաձայն ხარ" —
 * the Armenian word for „agree" where „თანახმა" belongs. The same letters the
 * buttons may not carry, in the reply's own words. A word the owner wrote
 * himself (an Armenian name, say) is his and stays.
 */
const FOREIGN_WORD_RE = /\S*[Ⴀ-჏ⴀ-⴯�Ա-Ֆա-և]\S*/gu;

/** The first word of the reply carrying such a letter that the owner did not write; null when none. */
export function foreignWordInReply(reply: string, ownerLine: string): string | null {
  for (const word of reply.match(FOREIGN_WORD_RE) ?? []) {
    if (!ownerLine.includes(word)) return word;
  }
  return null;
}

/** The turn that has the reply written again. */
export function foreignWordNudge(word: string): string {
  return (
    `(სისტემური შენიშვნა: პასუხში სიტყვა „${word}" ქართული ასოებით არ წერია. ` +
    'მფლობელს შენი წინა ტექსტი არ უნახავს: პასუხი ერთხელ, თავიდან დაწერე, ჩვეულებრივი ' +
    'ქართული ასოებით, ასო-ასო შემოწმებული, ბოდიშის გარეშე.)'
  );
}
