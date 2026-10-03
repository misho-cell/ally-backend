/**
 * Board #510 (Ninia, 2 Oct): „who is a programmer among my contacts?" searched
 * three words (პროგრამისტი, programmer, developer), offered a person who is
 * not a programmer, and found the real one, her own contact saved as a CTO and
 * software engineer, only after she pushed back twice and the model tried
 * „software" and „IT" (conversation 30467).
 *
 * People are saved under the words their friends use, not the word the owner
 * asks with. So when a tag search names one word of a profession family, the
 * result carries the family's other words and asks for them in the same turn,
 * before anything is answered. Only families whose words mean the same job;
 * a word that is a different job (a notary is not a lawyer) stays out.
 */
const PROFESSION_FAMILIES: readonly (readonly string[])[] = [
  [
    'პროგრამისტი',
    'programmer',
    'დეველოპერი',
    'developer',
    'software',
    'software engineer',
    'პროგრამირება',
    'კოდერი',
    'IT',
    'CTO',
    'frontend',
    'backend',
  ],
  ['იურისტი', 'ადვოკატი', 'lawyer', 'attorney', 'legal'],
  ['ბუღალტერი', 'ბუღალტერია', 'accountant', 'accounting'],
  ['დიზაინერი', 'დიზაინი', 'designer', 'design', 'UX', 'UI'],
  ['ექიმი', 'დოქტორი', 'doctor', 'MD'],
];

function normalized(word: string): string {
  return word.trim().toLowerCase();
}

/** The other words of the family the searched word belongs to; empty if none. */
export function relatedProfessionWords(searched: string): readonly string[] {
  const key = normalized(searched);
  if (key === '') return [];
  const family = PROFESSION_FAMILIES.find((words) => words.some((w) => normalized(w) === key));
  return family === undefined ? [] : family.filter((w) => normalized(w) !== key);
}

export const ALSO_SEARCH_NOTE =
  'People are saved under the words their friends use, not the word asked with. Before you ' +
  'answer, run search_by_tag for each word in also_search that you have not searched yet in ' +
  'this turn, then answer from all of them together.';
