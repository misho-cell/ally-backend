// Georgian first names as people actually save them (Answers-12 Part B, the
// founder's ruling of 10 Sep: „many people are writing contacts differently").
// A query for the full form must reach a contact saved under the short one and
// the other way round — Bachana ↔ Bacho, Vasil ↔ Vasiko, Teimuraz ↔ Temur.
// Latin, lowercase; spelling drift (kh↔x, ts↔c …) is applied AFTER these forms
// by buildSearchTerms, so only one spelling per form is listed here. Every name
// in a group is a form of the same first name; nothing here is a surname.
const NAME_FORM_GROUPS: readonly (readonly string[])[] = [
  ['bachana', 'bacho'],
  ['vasil', 'vasili', 'vasiko'],
  ['besarion', 'besik', 'beso'],
  ['teimuraz', 'temur', 'temo'],
  ['giorgi', 'george', 'gio', 'gigi', 'gigo', 'gogi', 'gia', 'goga'],
  ['davit', 'david', 'dato'],
  ['nikoloz', 'nika', 'niko', 'nikusha'],
  ['aleksandre', 'alexander', 'sandro', 'aleko'],
  ['ketevan', 'keti', 'keto', 'ketino'],
  ['tinatin', 'tiko', 'tina'],
  ['teona', 'theona'],
  ['beka', 'bekar'],
  ['ekaterine', 'eka'],
  ['zurab', 'zura', 'zuka'],
  ['irakli', 'ika', 'irako'],
  ['mikheil', 'mikhail', 'misha', 'misho', 'mishiko'],
  ['kakhaber', 'kakha'],
  ['ioseb', 'soso'],
  ['vakhtang', 'vakho', 'vato'],
  ['vladimer', 'lado'],
  ['revaz', 'rezo', 'reziko'],
  ['tengiz', 'tengo'],
  ['nodar', 'nodo'],
  ['konstantine', 'kote', 'kostya'],
  ['tamar', 'tamuna', 'tako', 'tamo'],
  ['mariam', 'mari', 'mariko'],
  ['nino', 'nini', 'ninutsa'],
  ['levan', 'levani'],
  ['dimitri', 'dimitry', 'dima', 'dito'],
  ['grigol', 'grisha'],
  ['ana', 'anna', 'aniko'],
  ['lasha', 'lashiko'],
  ['otar', 'otari', 'oto'],
  ['shalva', 'shako'],
  ['guram', 'gurami', 'guga'],
  ['archil', 'archi'],
  ['avtandil', 'avto'],
  ['nugzar', 'nugo'],
  ['malkhaz', 'malkho'],
  ['merab', 'meraba'],
  ['ramaz', 'rami'],
  ['tornike', 'tornik', 'torniko'],
  ['salome', 'salo'],
  ['sofia', 'sopho', 'sopo', 'sofo'],
  ['natia', 'nato', 'natuka'],
  ['elene', 'eliko', 'elena'],
  ['medea', 'medeya', 'medo'],
  ['khatia', 'khatuna', 'khato'],
  ['maia', 'maya', 'maiko'],
  ['nana', 'nanuka', 'nanuli'],
];

const FORMS_BY_NAME: ReadonlyMap<string, readonly string[]> = (() => {
  const map = new Map<string, readonly string[]>();
  for (const group of NAME_FORM_GROUPS) {
    for (const form of group) map.set(form, group);
  }
  return map;
})();

/**
 * Every known form of the first name `word` is (the word itself first), or
 * just the word when it is not a first name we know. Lowercased input expected.
 */
export function nameFormVariants(word: string): readonly string[] {
  const group = FORMS_BY_NAME.get(word);
  if (!group) return [word];
  return [word, ...group.filter((form) => form !== word)];
}
