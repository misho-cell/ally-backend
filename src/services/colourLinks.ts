import { query } from '../db/postgres/client';
import { normalizePhone, phoneDigits } from './phone';
import { labelTie, LabelTie } from './labelCloseness';
import { AllyColour, CLOSE_COLOURS, MAX_PHONES_PER_CALL, toColour } from './oldAllyColours.service';

/**
 * #5974 (3): a go-between ranked by the old Ally colours along the link — the
 * owner's colour for the bridge, and the bridge's colour for the next person.
 * Green outweighs blue outweighs yellow outweighs red; an uncoloured side
 * weighs nothing.
 *
 * Only the owner's side may be SAID exactly: it is the owner's own judgment. The
 * bridge's side orders the list and is said, at most, as "holds them close"
 * (green or blue) — the same fact a bubble already states — never as a colour
 * (D680: no member's private judgment about a named person, not even as a reason).
 *
 * World C (the tester's 68815): where the bridge has no colour for the next
 * person, the bridge's own label of them stands in — kin weighs as green, a
 * friend word as blue (labelCloseness.ts) — and is said the same way, as
 * "holds them close", never as the word they saved.
 */
const LINK_QUERY_TIMEOUT_MS = 3_000;

export const COLOUR_WEIGHT: Readonly<Record<AllyColour, number>> = {
  [AllyColour.Green]: 4,
  [AllyColour.Blue]: 3,
  [AllyColour.Yellow]: 2,
  [AllyColour.Red]: 1,
};
const UNCOLOURED_WEIGHT = 0;
/** The colour a bridge's own label stands in for, when the bridge gave no colour. */
const LABEL_TIE_COLOUR: Readonly<Record<LabelTie, AllyColour | null>> = {
  [LabelTie.Kin]: AllyColour.Green,
  [LabelTie.Friend]: AllyColour.Blue,
  [LabelTie.None]: null,
};
/** A member's labels of one person: their saved name and their tags. */
const MAX_LABELS_PER_LINK = 20;
/** Said in place of a bridge with no name to say. */
const UNNAMED_BRIDGE = 'this contact';

export interface LinkPair {
  readonly bridge: string;
  readonly next: string;
}

export interface LinkColours {
  /** The owner's own colour for the bridge. */
  readonly ownerColour: AllyColour | null;
  /** The bridge holds the next person green or blue. */
  readonly bridgeHoldsClose: boolean;
  /** Both sides' weights added — for ordering only, never shown. */
  readonly weight: number;
}

export const NO_LINK_COLOURS: LinkColours = {
  ownerColour: null,
  bridgeHoldsClose: false,
  weight: UNCOLOURED_WEIGHT,
};

export function weightOf(colour: AllyColour | null): number {
  return colour === null ? UNCOLOURED_WEIGHT : COLOUR_WEIGHT[colour];
}

/** The key one link is filed under: both ends by digits. */
export function linkKey(bridge: string, next: string): string {
  return `${phoneDigits(bridge)}>${phoneDigits(next)}`;
}

interface LinkRow {
  readonly bridge_phone: string;
  readonly next_phone: string;
  readonly owner_tier: string | null;
  readonly bridge_tier: string | null;
  readonly bridge_labels: string[] | null;
}

/** Both sides of each link in one statement: two primary-key probes per pair. */
const LINK_SQL = `
  SELECT p.bridge_phone, p.next_phone, own.tier AS owner_tier, theirs.tier AS bridge_tier,
         said.labels AS bridge_labels
    FROM unnest($2::text[], $3::text[]) AS p(bridge_phone, next_phone)
    LEFT JOIN human_relationship_tiers own
           ON own.user_id = $1::int AND own.contact_phone = p.bridge_phone
    LEFT JOIN LATERAL (
      SELECT h.tier
        FROM "UserPhone" up
        JOIN human_relationship_tiers h
          ON h.user_id = up."userId" AND h.contact_phone = p.next_phone
       WHERE up.phone = p.bridge_phone
       LIMIT 1
    ) theirs ON TRUE
    LEFT JOIN LATERAL (
      SELECT array_agg(l.label) AS labels
        FROM (
          SELECT ua.alias AS label
            FROM "UserPhone" up
            JOIN "UserAlias" ua ON ua."contactId" = up."userId" AND ua.phone = p.next_phone
           WHERE up.phone = p.bridge_phone
          UNION ALL
          SELECT ut.tag
            FROM "UserPhone" up
            JOIN "UserTags" ut ON ut."contactId" = up."userId" AND ut.phone = p.next_phone
           WHERE up.phone = p.bridge_phone
          LIMIT $5
        ) l
    ) said ON TRUE
   LIMIT $4`;

function uniquePairs(pairs: readonly LinkPair[]): LinkPair[] {
  const seen = new Map<string, LinkPair>();
  for (const pair of pairs) {
    const bridge = normalizePhone(pair.bridge);
    const next = normalizePhone(pair.next);
    if (bridge !== '' && next !== '') seen.set(linkKey(bridge, next), { bridge, next });
  }
  return [...seen.values()].slice(0, MAX_PHONES_PER_CALL);
}

/** The bridge's colour for the next person, or the one their own label stands in for. */
export function bridgeSide(
  tier: string | null,
  labels: readonly string[] | null,
): AllyColour | null {
  return toColour(tier) ?? LABEL_TIE_COLOUR[labelTie(labels ?? [])];
}

function fromRow(row: LinkRow): LinkColours {
  const ownerColour = toColour(row.owner_tier);
  const bridgeColour = bridgeSide(row.bridge_tier, row.bridge_labels);
  return {
    ownerColour,
    bridgeHoldsClose: bridgeColour !== null && CLOSE_COLOURS.includes(bridgeColour),
    weight: weightOf(ownerColour) + weightOf(bridgeColour),
  };
}

/** The colours along each link, by linkKey; a link with no row is absent. */
export async function linkColours(
  ownerId: string,
  pairs: readonly LinkPair[],
): Promise<Map<string, LinkColours>> {
  const unique = uniquePairs(pairs);
  const out = new Map<string, LinkColours>();
  if (unique.length === 0) return out;
  const result = await query<LinkRow>(
    LINK_SQL,
    [
      ownerId,
      unique.map((p) => p.bridge),
      unique.map((p) => p.next),
      unique.length,
      MAX_LABELS_PER_LINK,
    ],
    LINK_QUERY_TIMEOUT_MS,
  );
  for (const row of result.rows) {
    out.set(linkKey(row.bridge_phone, row.next_phone), fromRow(row));
  }
  return out;
}

/**
 * The short reason a bridge comes first, in the owner's terms: "your green
 * contact Nika holds them close". Null when neither side gives a reason.
 */
export function colourWhy(link: LinkColours, bridgeName: string | null): string | null {
  const who = bridgeName ?? UNNAMED_BRIDGE;
  if (link.ownerColour !== null && link.bridgeHoldsClose) {
    return `your ${link.ownerColour} contact ${who} holds them close`;
  }
  if (link.ownerColour !== null) return `${who} is your ${link.ownerColour} contact`;
  if (link.bridgeHoldsClose) return `${who} holds them close`;
  return null;
}

/**
 * Heaviest link first; equal weights keep the order they came in, so every
 * ordering already made (warmth, closeness, fit) stays the tie-break.
 */
export function byLinkWeight<T>(items: readonly T[], weight: (item: T) => number): T[] {
  return items
    .map((item, index) => ({ item, index, w: weight(item) }))
    .sort((a, b) => b.w - a.w || a.index - b.index)
    .map(({ item }) => item);
}
