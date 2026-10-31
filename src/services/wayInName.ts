import { georgianToLatin } from './tools/transliterate';
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

/** How many leading letters two spellings of a first name must share. */
const FIRST_NAME_STEM = 3;

function latinForm(word: string): string {
  return georgianToLatin(word.toLowerCase()).replace(/[^a-z]/g, '');
}

/**
 * The tester's 1117 (34779): „ვებში ეს ვიპოვე: • <a web name>, შენი კონტაქტი იქ:
 * <another person with the same surname>". The phonebook lookup matched the
 * surname alone. When the lead starts with a first name, the contact found must
 * carry that first name too (compared in Latin letters, so „Nini" and „ნინი"
 * agree); a firm, which starts with no first name, is matched as before.
 */
export function sameFirstName(leadFirstName: string | null, contactName: string): boolean {
  if (leadFirstName === null) return true;
  const wanted = latinForm(leadFirstName).slice(0, FIRST_NAME_STEM);
  if (wanted.length < FIRST_NAME_STEM) return true;
  return contactName.split(/[\s,;:()|·–—-]+/u).some((word) => latinForm(word).startsWith(wanted));
}

/** How many leading letters two spellings of a surname must share („ჯაჯანიძე", „Jajanidze"). */
const SURNAME_STEM = 4;
const NAME_WORD_SPLIT_RE = /[\s,;:()|·–—-]+/u;

/**
 * The tester's 79366 (a real member's LinkedIn list, 31 Oct): „Nikoloz
 * Kevkhishvili" was reached „through Nikoloz Papashvili", and so on for 334
 * rows. The phonebook lookup scores every word, and sameFirstName then holds
 * only the first name, so a namesake with another surname passed. A lead named
 * with a first name AND a surname is the owner's contact only when the contact
 * carries that surname too. A lead of one word (a firm, or a first name alone)
 * is matched as before.
 */
export function sameSurname(leadName: string, contactName: string): boolean {
  const words = leadName.split(NAME_WORD_SPLIT_RE).filter((w) => w.trim() !== '');
  if (words.length < 2) return true;
  const wanted = latinForm(words[words.length - 1]).slice(0, SURNAME_STEM);
  if (wanted.length < SURNAME_STEM) return true;
  return contactName.split(NAME_WORD_SPLIT_RE).some((word) => latinForm(word).startsWith(wanted));
}

/** A web address ending on a firm's name: „Ostati.ge" is the firm Ostati. */
const DOMAIN_SUFFIX_RE = /\.(ge|com|net|org|io|co|info|biz)$/iu;

/**
 * The tester's 1121 (35521): the page title „Ostati.ge სანტექნიკი ონკანის
 * შეკეთება კანალიზაცია" came out with „your contact there: გოჩა სანტექნიკი" —
 * a plumber the owner saved, matched on the trade word in the title. A firm is
 * looked for by its own name only: the first word left after places and
 * generic words, without a web suffix. A firm whose name is a later word is
 * missed — the safe side, since a missed way in is said as „not found" and a
 * wrong one is a false claim about the owner's own contact.
 */
export function firmSearchName(leadName: string): string {
  const first = wayInSearchName(leadName).split(' ')[0] ?? '';
  return first.replace(DOMAIN_SUFFIX_RE, '');
}
