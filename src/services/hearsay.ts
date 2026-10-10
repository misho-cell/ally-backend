/**
 * 3235's second half (ME-023): the owner only REPORTED what a web page says —
 * „ინტერნეტში წერია, რომ …" — and it was saved as the owner's own word. A fact
 * the owner relays from the web or from hearsay is saved as mentioned.
 */
const HEARSAY_RE =
  /(ინტერნეტში|ვებში|გუგლში|ფეისბუქზე|ლინკდინზე|საიტზე|სადღაც)\s+(?:\p{L}+\s+){0,2}?(წერია|ვნახე|წავიკითხე|ეწერა)|ამბობენ|გავიგე,?\s+რომ|online|on the (?:internet|web)|I read (?:that|somewhere)|they say|I heard|в интернете|пишут|говорят|слышал|en internet|dicen que/iu;

/** Did the owner's line relay something from the web or from others, not say it themselves? */
export function relaysHearsay(ownerLine: string): boolean {
  return HEARSAY_RE.test(ownerLine);
}
