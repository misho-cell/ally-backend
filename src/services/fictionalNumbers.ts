/**
 * The phone numbers a fictional test seat may use — ONLY ranges reserved
 * for fiction by a numbering authority, so a seat can never sit on, or save,
 * a number a real person could own.
 *
 *   +1 202 555 0100 – 0199   NANP: 555-0100…0199 is the block set aside for
 *                            fiction (other 555 numbers can be real).
 *   +44 7700 900000 – 900999 Ofcom: UK mobile numbers reserved for drama.
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
