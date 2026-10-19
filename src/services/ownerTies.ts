import { query } from '../db/postgres/client';
import { phoneDigits } from './phone';
import { warmthForPhones } from './warmth.service';
import { RunLanguage } from './runLanguage';

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

/**
 * #5479: why this bridge comes first, after the name. A reach note says
 * something the owner must know before approving, so it wins over a tie.
 */
export const TIE_NOTE: Readonly<Record<RunLanguage, Record<OwnerTieReason, string>>> = {
  ka: {
    [OwnerTieReason.SaidClose]: '(შენი ახლო ადამიანი)',
    [OwnerTieReason.Family]: '(შენი ოჯახის წევრი)',
    [OwnerTieReason.Close]: '(შენი ახლო ადამიანი)',
    [OwnerTieReason.DealtWith]: '(უკვე დაგეხმარა)',
  },
  en: {
    [OwnerTieReason.SaidClose]: '(someone close to you)',
    [OwnerTieReason.Family]: '(your family)',
    [OwnerTieReason.Close]: '(someone close to you)',
    [OwnerTieReason.DealtWith]: '(has helped you before)',
  },
  ru: {
    [OwnerTieReason.SaidClose]: '(близкий тебе человек)',
    [OwnerTieReason.Family]: '(твоя семья)',
    [OwnerTieReason.Close]: '(близкий тебе человек)',
    [OwnerTieReason.DealtWith]: '(уже помогал тебе)',
  },
  es: {
    [OwnerTieReason.SaidClose]: '(alguien cercano a ti)',
    [OwnerTieReason.Family]: '(tu familia)',
    [OwnerTieReason.Close]: '(alguien cercano a ti)',
    [OwnerTieReason.DealtWith]: '(ya te ayudó antes)',
  },
};

/** #1849: the ties that make a link warm — the owner said so, family, or a close relationship. */
const WARM_REASONS: ReadonlySet<string> = new Set([
  OwnerTieReason.SaidClose,
  OwnerTieReason.Family,
  OwnerTieReason.Close,
]);

export function isWarmTie(reason: unknown): boolean {
  return typeof reason === 'string' && WARM_REASONS.has(reason);
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

/**
 * #6339 (Giorgi, G-085, thread 60691): the plan said „Lika (has helped you
 * before)" four times and Lika never had — Giorgi had answered three of HER
 * questions. A reply is warmth for the pair, so it is written on both sides;
 * whether it was help is not. It was help to the owner only when the person
 * answered the owner's own question, or accepted the owner's own introduction.
 */
async function helpedTheOwner(userId: string, forms: readonly string[]): Promise<Set<string>> {
  const result = await query<{ phone: string }>(
    `SELECT DISTINCT w.contact_phone AS phone
       FROM warmth_events w
      WHERE w.user_id = $1::int
        AND w.contact_phone = ANY($2::text[])
        AND (EXISTS (SELECT 1 FROM task_asks a
                      WHERE w.kind = 'ask_answered' AND w.ref = 'ask_' || a.id
                        AND a.from_user_id = $1::int AND a.declined_at IS NULL)
          OR EXISTS (SELECT 1 FROM introduction_requests ir
                      WHERE w.kind = 'intro_accepted' AND w.ref = 'intro_' || ir.id
                        AND ir.requester_user_id = $1::int))
      LIMIT $3`,
    [userId, forms, forms.length],
    QUERY_TIMEOUT_MS,
  );
  return new Set(result.rows.map((row) => phoneDigits(row.phone)));
}

function reasonOf(
  stored: StoredTie | undefined,
  kinds: readonly string[],
  helpedOwner: boolean,
): OwnerTieReason | null {
  if (kinds.includes(STATED_CLOSE_KIND)) return OwnerTieReason.SaidClose;
  if (stored?.kind === FAMILY_TYPE) return OwnerTieReason.Family;
  if (Number(stored?.strength ?? 0) >= CLOSE_STRENGTH) return OwnerTieReason.Close;
  if (helpedOwner) return OwnerTieReason.DealtWith;
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
  const dealtWith = [...warmth]
    .filter(([, w]) => w.kinds.some((k) => DEALT_WITH_KINDS.includes(k)))
    .map(([phone]) => phone);
  const helped =
    dealtWith.length === 0 ? new Set<string>() : await helpedTheOwner(userId, dealtWith);
  for (const d of new Set([...storedBy.keys(), ...warmthBy.keys()])) {
    const s = storedBy.get(d);
    const w = warmthBy.get(d);
    out.set(d, {
      closeness: Number(s?.strength ?? UNKNOWN_TIE) + (w?.score ?? 0),
      reason: reasonOf(s, w?.kinds ?? [], helped.has(d)),
    });
  }
  return out;
}
