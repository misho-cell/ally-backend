import { query } from '../db/postgres/client';
import { normalizePhone, phoneDigits } from './phone';

/**
 * #5974 (founder's Priority 1, "my bubble"): the old Ally colours.
 *
 * They live in `human_relationship_tiers` (migration 080), backfilled once from
 * old Ally's own hand-sorted screen (UserConnection.relationshipStatus: allies =
 * green, loyal = blue, connections = yellow, contacts = red). Account 501 reads
 * 89 / 185 / 430 / 982 there, the founder's own count. Every phone in the table
 * is stored `+digits`, so the reads below match exactly on normalized numbers.
 *
 * Two things are read for a page of people, in two queries for the whole page:
 *
 *   owner_colour — the OWNER's own colour for the person;
 *   bubble       — how many of the owner's green and blue people hold this
 *                  person green or blue too, and up to three of them by the
 *                  name the OWNER saved them under.
 *
 * Privacy (D149, D523/D539, D680): no other member's colour for a named member
 * ever leaves this file, and no other member's label is ever read — only the
 * count, and the owner's own names for the bridges.
 */
const COLOUR_QUERY_TIMEOUT_MS = 3_000;
/** The most numbers one call reads; a tool page is far smaller. */
export const MAX_PHONES_PER_CALL = 100;
/** The owner's green and blue members read as bridges; account 501 has 274 of them coloured. */
const MAX_CLOSE_BRIDGES = 5_000;
/** How many bridges are named in a bubble. */
export const MAX_CLOSEST = 3;
/** Read a few past MAX_CLOSEST, so a label that cannot be said does not shorten the list. */
const CLOSEST_READ = MAX_CLOSEST + 3;
/** A label with a run this long of digits is a number, not a name (D149). */
const NUMBER_RUN_RE = /\d{5,}/;
const HAS_LETTER_RE = /\p{L}/u;

export enum AllyColour {
  Green = 'green',
  Blue = 'blue',
  Yellow = 'yellow',
  Red = 'red',
}

/** Strongest first; the array position is the rank the SQL orders by. */
export const COLOURS_BY_STRENGTH: readonly AllyColour[] = [
  AllyColour.Green,
  AllyColour.Blue,
  AllyColour.Yellow,
  AllyColour.Red,
];

/** The two colours that mean "close" — the only ones a bubble is made of. */
export const CLOSE_COLOURS: readonly AllyColour[] = [AllyColour.Green, AllyColour.Blue];

export interface Bubble {
  readonly count: number;
  readonly closest: readonly string[];
}

export interface PersonColours {
  readonly owner_colour: AllyColour | null;
  readonly bubble: Bubble;
}

export const EMPTY_BUBBLE: Bubble = { count: 0, closest: [] };

/** A stored tier as a colour, or null for anything the table should not hold. */
export function toColour(raw: unknown): AllyColour | null {
  return COLOURS_BY_STRENGTH.find((colour) => colour === raw) ?? null;
}

/** An owner label that may be said as a name: it has a letter and carries no number. */
export function isSayableLabel(label: string): boolean {
  return HAS_LETTER_RE.test(label) && !NUMBER_RUN_RE.test(label);
}

/** The page's numbers, normalized, de-duplicated and capped. */
export function pagePhones(phones: readonly string[]): string[] {
  const normalized = phones.map(normalizePhone).filter((p) => p !== '');
  return [...new Set(normalized)].slice(0, MAX_PHONES_PER_CALL);
}

interface OwnColourRow {
  readonly phone: string;
  readonly tier: string;
}

/** The owner's own colour for each number, by digits. */
async function ownColours(
  ownerId: string,
  phones: readonly string[],
): Promise<Map<string, AllyColour>> {
  const result = await query<OwnColourRow>(
    `SELECT contact_phone AS phone, tier
       FROM human_relationship_tiers
      WHERE user_id = $1::int AND contact_phone = ANY($2::text[])
      LIMIT $3`,
    [ownerId, phones, phones.length],
    COLOUR_QUERY_TIMEOUT_MS,
  );
  const out = new Map<string, AllyColour>();
  for (const row of result.rows) {
    const colour = toColour(row.tier);
    if (colour !== null) out.set(phoneDigits(row.phone), colour);
  }
  return out;
}

interface BubbleRow {
  readonly phone: string;
  readonly count: number | string;
  readonly closest: string[] | null;
}

/**
 * One statement for the whole page. The owner's green and blue members are
 * read once (a few hundred rows on the largest account), each one's colour for
 * the page's numbers is an exact primary-key probe, and the owner's own label
 * is looked up only for the bridges that matched.
 */
const BUBBLE_SQL = `
  WITH close_bridges AS (
    SELECT DISTINCT ON (up."userId")
           up."userId" AS bridge_id, h.contact_phone AS bridge_phone,
           array_position($4::text[], h.tier) AS owner_rank
      FROM human_relationship_tiers h
      JOIN "UserPhone" up ON up.phone = h.contact_phone
     WHERE h.user_id = $1::int AND h.tier = ANY($3::text[]) AND up."userId" <> $1::int
     ORDER BY up."userId", array_position($4::text[], h.tier)
     LIMIT $5
  ),
  links AS (
    SELECT h.contact_phone AS target, cb.bridge_id, cb.bridge_phone,
           cb.owner_rank + array_position($4::text[], h.tier) AS link_rank
      FROM close_bridges cb
      JOIN human_relationship_tiers h ON h.user_id = cb.bridge_id
     WHERE h.contact_phone = ANY($2::text[]) AND h.tier = ANY($3::text[])
  ),
  labelled AS (
    SELECT l.target, l.bridge_id, l.link_rank, TRIM(own.alias) AS label
      FROM links l
      LEFT JOIN LATERAL (
        SELECT ua.alias
          FROM "UserAlias" ua
         WHERE ua."contactId" = $1::int AND ua.phone = l.bridge_phone
           AND NULLIF(TRIM(ua.alias), '') IS NOT NULL
         ORDER BY ua.id DESC
         LIMIT 1
      ) own ON TRUE
  )
  SELECT target AS phone,
         COUNT(DISTINCT bridge_id)::int AS count,
         (array_agg(label ORDER BY link_rank, label) FILTER (WHERE label IS NOT NULL))[1:$6] AS closest
    FROM labelled
   GROUP BY target
   LIMIT $7`;

/** Each number's bubble, by digits; a number nobody close holds is absent. */
async function bubbles(ownerId: string, phones: readonly string[]): Promise<Map<string, Bubble>> {
  const result = await query<BubbleRow>(
    BUBBLE_SQL,
    [
      ownerId,
      phones,
      CLOSE_COLOURS,
      COLOURS_BY_STRENGTH,
      MAX_CLOSE_BRIDGES,
      CLOSEST_READ,
      phones.length,
    ],
    COLOUR_QUERY_TIMEOUT_MS,
  );
  const out = new Map<string, Bubble>();
  for (const row of result.rows) {
    const closest = (row.closest ?? []).filter(isSayableLabel).slice(0, MAX_CLOSEST);
    out.set(phoneDigits(row.phone), { count: Number(row.count), closest });
  }
  return out;
}

/**
 * The owner's colour and the bubble for every number on a page, by digits.
 * Every number asked for gets an entry, so a row with nothing to say still
 * carries `owner_colour: null` and a zero bubble.
 */
export async function coloursAndBubbles(
  ownerId: string,
  phones: readonly string[],
): Promise<Map<string, PersonColours>> {
  const page = pagePhones(phones);
  const out = new Map<string, PersonColours>();
  if (page.length === 0) return out;
  const [own, bubbleBy] = await Promise.all([ownColours(ownerId, page), bubbles(ownerId, page)]);
  for (const phone of page) {
    const d = phoneDigits(phone);
    out.set(d, { owner_colour: own.get(d) ?? null, bubble: bubbleBy.get(d) ?? EMPTY_BUBBLE });
  }
  return out;
}
