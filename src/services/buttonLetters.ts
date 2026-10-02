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
 */
const FOREIGN_LETTER_RE = /[Ⴀ-Ⴥⴀ-ⴥԱ-Ֆա-և]/u;

/** The first label that carries such a letter, with the letter; null when all are clean. */
export function labelWithForeignLetter(
  labels: readonly string[],
): { readonly label: string; readonly letter: string } | null {
  for (const label of labels) {
    const found = label.match(FOREIGN_LETTER_RE);
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
