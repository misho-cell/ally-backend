/**
 * 4192 (tester 49369, seat 182168): „💙 ჩემი სტომატოლოგია, დაიმახსოვრე." —
 * 💙 is a saved contact, and the line says that contact is the owner's
 * dentist. It was written to the OWNER's profile (profession „სტომატოლოგი",
 * industry „სტომატოლოგია"), and written again after the owner said „მე
 * სტომატოლოგი არ ვარ".
 *
 * „My <role>" names somebody else's role: my dentist, my lawyer. A profile
 * value that is that role, on a line that says nothing about the owner
 * himself being it, is refused, and the run is told where the fact belongs.
 */
const MY_ROLE_RE = /(?:^|[^\p{L}])(?:ჩემი|my)\s+(\p{L}+)/giu;

/** The owner speaking about himself: „მე … ვარ", „I am", „I'm". */
const ABOUT_HIMSELF_RE = /(?:^|[^\p{L}])(?:ვარ|i\s+am|i['’]m)(?:[^\p{L}]|$)/iu;

/** Long enough that „ექიმი"/„ექიმია" match and „ის"/„ისინი" do not. */
const STEM_CHARS = 5;

function stem(word: string): string {
  return word.toLocaleLowerCase().slice(0, STEM_CHARS);
}

/** True when the line names `value` as the role of somebody who is the owner's. */
export function valueIsSomeoneElsesRole(ownerLine: string, value: string): boolean {
  const target = stem(value.trim());
  if (target.length < STEM_CHARS || ABOUT_HIMSELF_RE.test(ownerLine)) return false;
  for (const match of ownerLine.matchAll(MY_ROLE_RE)) {
    if (stem(match[1] ?? '') === target) return true;
  }
  return false;
}

export const SOMEONE_ELSES_ROLE_REFUSAL =
  'Not saved to the owner’s profile. The owner’s line says somebody else is their ' +
  '„<role>" (my dentist, my lawyer) — that is that contact’s role, not the owner’s. ' +
  'Save it on the contact the line names, and tell the owner in one line that you did.';
