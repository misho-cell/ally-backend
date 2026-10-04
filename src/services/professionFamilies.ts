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
  // The tester's 1102 (C10, six rounds): one friend saved the vet as „ვეტერინარი",
  // another as „ვეტექიმი", and only one was ever found.
  ['ვეტერინარი', 'ვეტექიმი', 'veterinarian', 'vet'],
  // The tester's 1111 (34175): „ცეკვა" and „ქორეოგრაფია" found nobody in the second
  // circle while a friend had saved her as „ცეკვის მასწავლებელი". The words people
  // save come first: the second circle searches only the first three.
  [
    'ცეკვის მასწავლებელი',
    'ქორეოგრაფი',
    'ცეკვა',
    'ქორეოგრაფია',
    'ცეკვის პედაგოგი',
    'dance teacher',
    'choreographer',
  ],
  // The tester's 1133 (V1, 36539): a dripping kitchen tap, and the owner's own
  // „ვანო ხელოსანი" on Netai was never searched. A small plumbing job is a
  // handyman's job too, so the handyman is in this family; the saved words first.
  ['სანტექნიკოსი', 'ხელოსანი', 'სანტექნიკა', 'plumber', 'plumbing', 'handyman'],
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

/** Board #510, 1086: the server searches the family itself; the run is told not to repeat it. */
export const ALSO_SEARCHED_NOTE =
  'People are saved under the words their friends use, not the word asked with. The words in ' +
  'also_searched were searched together with yours and their people are already in results ' +
  '(matched_word says which word found each one). Do not search them again; answer from these.';
