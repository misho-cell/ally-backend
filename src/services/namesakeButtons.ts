/**
 * 3466 (box 52934, fictional seats): two contacts saved as „დათო გამოგონილი".
 * The helper saw the buttons [„დათო გამოგონილი (საბურთალოს სანტექნიკი)",
 * „დათო გამოგონილი (მეორე ჩანაწერი)", „სხვა, მე დავწერ"], typed „მეორე", and
 * the asker got the Saburtalo plumber's number: the ordinal was read against the
 * name search's order, while the buttons — written by the model — came in their
 * own order. An ordinal names a BUTTON. Each button is matched to the one
 * namesake its own words point to (the words beyond the shared name, found in
 * what the search showed about that person), or, when exactly one button and
 * one namesake are left over, to that one. Anything less certain names nobody,
 * and no number is sent on a guess.
 */
export interface Namesake {
  readonly phone: string;
  /** The name the search showed, lower-cased; namesakes share it. */
  readonly name: string;
  /** Everything the search showed about this person, lower-cased: the words a button may use. */
  readonly text: string;
}

/** Georgian case endings differ („საბურთალოს" / „საბურთალო"): words match on their first letters. */
const STEM_CHARS = 5;
const MIN_WORD_CHARS = 3;

/** The namesakes a person-search result offered, in its order, with what it showed about each. */
export function namesakesIn(result: unknown): Namesake[] {
  const rows = (result as { results?: unknown } | null)?.results;
  if (!Array.isArray(rows)) return [];
  return rows.flatMap((row) => {
    const r = (row ?? {}) as Record<string, unknown>;
    if (typeof r.phone !== 'string' || r.phone === '') return [];
    const { phone, ...rest } = r;
    const name = typeof r.name === 'string' ? r.name.trim().toLocaleLowerCase() : '';
    return [{ phone, name, text: JSON.stringify(rest).toLocaleLowerCase() }];
  });
}

function stemsOf(label: string): string[] {
  return label
    .toLocaleLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((word) => word.length >= MIN_WORD_CHARS)
    .map((word) => word.slice(0, STEM_CHARS));
}

/** The words of a button that are not shared by every namesake: the ones that tell them apart. */
function tellingStems(label: string, namesakes: readonly Namesake[]): string[] {
  return stemsOf(label).filter((stem) => !namesakes.every((n) => n.text.includes(stem)));
}

/** The one namesake a button's telling words point to; null for none or several. */
function namesakeNamedBy(label: string, namesakes: readonly Namesake[]): string | null {
  const stems = tellingStems(label, namesakes);
  if (stems.length === 0) return null;
  const hits = namesakes.filter((n) => stems.some((stem) => n.text.includes(stem)));
  return hits.length === 1 ? hits[0].phone : null;
}

/**
 * The buttons that stand for a namesake, in their order: those that start with
 * the shared name; or, when none does (box 53065: [„სანტექნიკის ნომერი",
 * „საბურთალოს სანტექნიკის ნომერი"]), those that use words the search showed
 * about one of them — „სხვა, მე დავწერ" uses none and is left out either way.
 */
function namesakeButtons(buttons: readonly string[], namesakes: readonly Namesake[]): string[] {
  const names = namesakes.map((n) => n.name).filter((name) => name !== '');
  const named = buttons.filter((label) => {
    const lower = label.trim().toLocaleLowerCase();
    return names.some((name) => lower.startsWith(name));
  });
  if (named.length > 0) return named;
  return buttons.filter((label) =>
    stemsOf(label).some((stem) => namesakes.some((n) => n.text.includes(stem))),
  );
}

/** The position, among the namesake buttons, of the button whose text the line is; -1 if none. */
export function tappedButtonIndex(
  line: string,
  buttons: readonly string[],
  namesakes: readonly Namesake[],
): number {
  const said = line.trim().toLocaleLowerCase();
  return namesakeButtons(buttons, namesakes).findIndex(
    (label) => label.trim().toLocaleLowerCase() === said,
  );
}

/**
 * The phone the button at `index` stands for; null when it cannot be told for
 * certain. Only buttons that start with the shared name count as namesake
 * buttons („სხვა, მე დავწერ" is not one), and they keep their order.
 */
export function phoneForButton(
  buttons: readonly string[],
  index: number,
  namesakes: readonly Namesake[],
): string | null {
  const own = namesakeButtons(buttons, namesakes);
  if (index < 0 || index >= own.length || own.length !== namesakes.length) return null;
  const named = own.map((label) => namesakeNamedBy(label, namesakes));
  const direct = named[index];
  if (direct !== null)
    return named.filter((phone) => phone === direct).length === 1 ? direct : null;
  const unnamedButtons = named.filter((phone) => phone === null).length;
  const leftOver = namesakes.filter((n) => !named.includes(n.phone));
  return unnamedButtons === 1 && leftOver.length === 1 ? leftOver[0].phone : null;
}
