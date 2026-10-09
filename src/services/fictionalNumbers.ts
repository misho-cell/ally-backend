/**
 * The phone numbers a fictional test seat may use — ONLY ranges reserved
 * for fiction by a numbering authority, so a seat can never sit on, or save,
 * a number a real person could own.
 *
 *   +1 202 555 0100 – 0199   NANP: 555-0100…0199 is the block set aside for
 *                            fiction (other 555 numbers can be real).
 *   +44 7700 900000 – 900999 Ofcom: UK mobile numbers reserved for drama.
 *   +44 20 7946 0000 – 0999  Ofcom: London geographic numbers reserved for drama.
 *   +44 161 496 0000 – 0999  Ofcom: Manchester geographic numbers reserved for drama.
 *   +44 113/114/115/116/117 496 0000 – 0999
 *                            Ofcom: Leeds, Sheffield, Nottingham, Leicester and Bristol drama numbers.
 *
 * Blocks five to eight, 4 October: the tester's 1115 and the founder's D623 —
 * no free number was left in the first four, and the prompt loop needs six more
 * worlds. Misho, the same morning: „დაუმატე".
 *
 * The fourth block, 3 October: the tester's 1100 asked for a fresh world of
 * about 88 numbers for each of at least eight prompt rounds (the founder's
 * D606–D608); the London block had 462 free, five rounds' worth. Misho, the
 * same day: „კი, გახსენი მეოთხე ბლოკი".
 *
 * The tester's 997 (2 Oct): both blocks full — 168 seats, and 1,035 numbers
 * used as fictional contacts in the seats' phonebooks. Misho, 2 October:
 * „გააკეთე". A third reserved block rather than freeing used ones: freeing
 * means deleting seats or their contacts, and other tests still read them.
 *
 * The seat's 873 (30 Sep): the first block was full. They proposed
 * +1 202 555 1000–1999, which is NOT reserved and could reach a real person;
 * the Ofcom block is the reserved one of that size.
 *
 * Each check is EXACT — prefix, digit count and slot bounds — never „starts
 * with": a prefix test would accept +12025551234, somebody's number somewhere.
 */
interface FictionalRange {
  readonly prefix: string;
  readonly digits: number;
  readonly from: number;
  readonly to: number;
}

const RANGES: readonly FictionalRange[] = [
  { prefix: '+1202555', digits: 4, from: 100, to: 199 },
  { prefix: '+447700', digits: 6, from: 900000, to: 900999 },
  { prefix: '+44207946', digits: 4, from: 0, to: 999 },
  { prefix: '+44161496', digits: 4, from: 0, to: 999 },
  { prefix: '+44113496', digits: 4, from: 0, to: 999 },
  { prefix: '+44114496', digits: 4, from: 0, to: 999 },
  { prefix: '+44115496', digits: 4, from: 0, to: 999 },
  { prefix: '+44117496', digits: 4, from: 0, to: 999 }, // Block nine, 9 Oct: Ofcom's Leicester drama range — the tester was blocked all night with no free
  // slot (ops 06:46Z); Misho: „ნომრებით თქვენ გადაწყვიტეთ" (§110).
  { prefix: '+44116496', digits: 4, from: 0, to: 999 },
];

function slotText(range: FictionalRange, slot: number): string {
  return String(slot).padStart(range.digits, '0');
}

export function isFictionalNumber(phone: string): boolean {
  return RANGES.some((range) => {
    if (!phone.startsWith(range.prefix)) return false;
    const rest = phone.slice(range.prefix.length);
    if (rest.length !== range.digits || !/^\d+$/.test(rest)) return false;
    const slot = Number(rest);
    return slot >= range.from && slot <= range.to;
  });
}

/** Every fictional number, the first block first, in order. */
export function allFictionalNumbers(): string[] {
  const out: string[] = [];
  for (const range of RANGES) {
    for (let slot = range.from; slot <= range.to; slot += 1) {
      out.push(`${range.prefix}${slotText(range, slot)}`);
    }
  }
  return out;
}

/** How the ranges are named in a refusal. */
export const FICTIONAL_RANGES_TEXT = RANGES.map(
  (r) => `${r.prefix}${slotText(r, r.from)}–${slotText(r, r.to)}`,
).join(' or ');
