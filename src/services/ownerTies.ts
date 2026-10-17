import { query } from '../db/postgres/client';
import { phoneDigits } from './phone';
import { warmthForPhones } from './warmth.service';

/**
 * #5479 (founder, 17 Oct; Misho's yes): warm routes. How close the owner is to
 * a person they hold — the stored relationship (formal 0.4, close ≈0.67,
 * family 0.9) plus the warmth since (the owner saying so through
 * save_close_contact, asks answered, introductions accepted) — and the one
 * plain reason that closeness rests on. The reason is about the owner's OWN
 * tie, so it may be said to the owner; it is never said to anybody else.
 */
const QUERY_TIMEOUT_MS = 5_000;
export const UNKNOWN_TIE = 0.4;
const CLOSE_STRENGTH = 0.65;
const FAMILY_TYPE = 'family';
const STATED_CLOSE_KIND = 'stated_close';
const DEALT_WITH_KINDS: readonly string[] = ['ask_answered', 'intro_accepted'];

export enum OwnerTieReason {
  /** The owner said so (save_close_contact). */
  SaidClose = 'you_said_close',
  Family = 'family',
  Close = 'close',
  /** They answered the owner or took an introduction from them in Netai. */
  DealtWith = 'helped_you_before',
}

export interface OwnerTie {
  readonly closeness: number;
  readonly reason: OwnerTieReason | null;
}

/** Both spellings of each number, as the tables hold them. */
export function phoneForms(phones: readonly string[]): string[] {
  return [...new Set(phones.map(phoneDigits).flatMap((d) => [`+${d}`, d]))];
}

interface StoredTie {
  readonly phone: string;
  readonly strength: number | null;
  readonly kind: string | null;
}

async function storedTies(userId: string, forms: readonly string[]): Promise<StoredTie[]> {
  const result = await query<StoredTie>(
    `SELECT DISTINCT ON (contact_phone) contact_phone AS phone, strength_score AS strength,
            relationship_type AS kind
       FROM contact_relationship_scores
      WHERE user_id = $1::int AND contact_phone = ANY($2::text[])
      ORDER BY contact_phone, strength_score DESC NULLS LAST
      LIMIT $3`,
    [userId, forms, forms.length],
    QUERY_TIMEOUT_MS,
  );
  return result.rows;
}

function reasonOf(stored: StoredTie | undefined, kinds: readonly string[]): OwnerTieReason | null {
  if (kinds.includes(STATED_CLOSE_KIND)) return OwnerTieReason.SaidClose;
  if (stored?.kind === FAMILY_TYPE) return OwnerTieReason.Family;
  if (Number(stored?.strength ?? 0) >= CLOSE_STRENGTH) return OwnerTieReason.Close;
  if (kinds.some((k) => DEALT_WITH_KINDS.includes(k))) return OwnerTieReason.DealtWith;
  return null;
}

/** The owner's tie to each of these people, by phone digits. */
export async function ownerTiesTo(
  userId: string,
  phones: readonly string[],
): Promise<Map<string, OwnerTie>> {
  const forms = phoneForms(phones);
  const out = new Map<string, OwnerTie>();
  if (forms.length === 0) return out;
  const [stored, warmth] = await Promise.all([
    storedTies(userId, forms),
    warmthForPhones(userId, forms),
  ]);
  const storedBy = new Map(stored.map((s) => [phoneDigits(s.phone), s]));
  const warmthBy = new Map([...warmth].map(([phone, w]) => [phoneDigits(phone), w]));
  for (const d of new Set([...storedBy.keys(), ...warmthBy.keys()])) {
    const s = storedBy.get(d);
    const w = warmthBy.get(d);
    out.set(d, {
      closeness: Number(s?.strength ?? UNKNOWN_TIE) + (w?.score ?? 0),
      reason: reasonOf(s, w?.kinds ?? []),
    });
  }
  return out;
}
