import { nameKey } from './tools/transliterate';

/**
 * The tester's 69134 (#6304, 0 of 3): the plan named „ზურაბ კვარაცხელია" and the
 * search had found him as „Zura Kvaratskhelia" (the friends' label), so the exact
 * comparison matched nobody and no group was drawn. One person under two
 * spellings is still one person.
 */
const FIRST_NAME_PREFIX = 3;

/** Same surname and the same start of the first name, read by sound in either script („Zura" / „ზურაბ"). */
export function sameNameBySound(a: string, b: string): boolean {
  const [aFirst, ...aRest] = nameKey(a)
    .split(' ')
    .filter((w) => w !== '');
  const [bFirst, ...bRest] = nameKey(b)
    .split(' ')
    .filter((w) => w !== '');
  if (aFirst === undefined || bFirst === undefined || aRest.length === 0 || bRest.length === 0) {
    return false;
  }
  const surname = (words: string[]): string => words[words.length - 1];
  return (
    surname(aRest) === surname(bRest) &&
    aFirst.slice(0, FIRST_NAME_PREFIX) === bFirst.slice(0, FIRST_NAME_PREFIX)
  );
}
