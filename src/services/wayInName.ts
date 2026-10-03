/**
 * The old seat's notes to 1101 (32983): the web lead „არქიტექტურული სტუდია
 * ZROBIM architects თბილისი, საქართველო" was shown with „your contact there:
 * ვასო სანტექნიკი თბილისი" — a plumber, matched on the word „თბილისი". A
 * place or a generic word is not the organisation's name; only the words that
 * are left are looked for in the owner's phonebook.
 */
const NOT_THE_NAME_RE =
  /^(თბილის|ბათუმ|ქუთაის|რუსთავ|ზუგდიდ|გორ[იში]|თელავ|საქართველ|სტუდი|კომპანი|შპს|სს$|ჯგუფ|სერვის|ცენტრ|მაღაზი|ოფის|tbilisi|batumi|kutaisi|rustavi|georgia|studio|company|llc|ltd|inc|group|services?|center|centre|shop|office|the|and|of)/iu;

/** The organisation's own words, places and generic words removed; '' when nothing is left. */
export function wayInSearchName(leadName: string): string {
  return leadName
    .split(/[\s,;:()|·–—-]+/u)
    .map((w) => w.trim())
    .filter((w) => w.length >= 2 && !NOT_THE_NAME_RE.test(w))
    .join(' ');
}
