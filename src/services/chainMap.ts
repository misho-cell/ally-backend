/**
 * Task 1849, stage one (§127): the map of a path from the owner to a named
 * target — the owner, up to three Netai members in the middle, the target.
 * The pure part: which paths may be offered, in which order, and how each one
 * reads link by link. Nothing here sends anything.
 */

/** Owner + three members + target: four steps (the founder, 6 Oct). */
export const MAX_CHAIN_HOPS = 4;
/** How many maps the owner is shown. */
export const MAX_CHAIN_MAPS = 3;

export enum ChainLinkRole {
  You = 'you',
  Bridge = 'bridge',
  Target = 'target',
}

/** Before anything is sent the first person in the middle is next; the rest are not contacted. */
export enum ChainLinkState {
  Next = 'next',
  NotContacted = 'not_contacted',
}

export interface ChainLink {
  /** The sealed id the member card and the contacts list use; null for the owner. */
  readonly id: string | null;
  readonly name: string | null;
  readonly role: ChainLinkRole;
  readonly state: ChainLinkState | null;
  readonly is_member: boolean;
}

export interface ChainMap {
  readonly hops: number;
  /** How many steps of the path are a confirmed warm tie of the person taking them. */
  readonly warm_steps: number;
  readonly links: readonly ChainLink[];
}

/** A raw path: the phones in the middle, in order. */
export interface CandidatePath {
  readonly middle: readonly string[];
  readonly warmSteps: number;
}

/**
 * Offered only when every person in the middle is a member (the request travels
 * assistant to assistant) and nobody on it is blocked in either direction.
 */
export function offerable(
  middle: readonly string[],
  isMember: (phone: string) => boolean,
  blocked: (phone: string) => boolean,
): boolean {
  return middle.length > 0 && middle.every((phone) => isMember(phone) && !blocked(phone));
}

/** Fewest steps first, then the warmest; the cut is the last thing that happens. */
export function rankedPaths(paths: readonly CandidatePath[]): CandidatePath[] {
  return [...paths]
    .sort((a, b) => a.middle.length - b.middle.length || b.warmSteps - a.warmSteps)
    .slice(0, MAX_CHAIN_MAPS);
}

export interface LinkPerson {
  readonly id: string;
  readonly name: string | null;
  readonly isMember: boolean;
}

/** One path as the owner reads it, link by link. */
export function chainMapOf(
  path: CandidatePath,
  person: (phone: string) => LinkPerson,
  target: LinkPerson,
): ChainMap {
  const bridges: ChainLink[] = path.middle.map((phone, index) => {
    const who = person(phone);
    return {
      id: who.id,
      name: who.name,
      role: ChainLinkRole.Bridge,
      state: index === 0 ? ChainLinkState.Next : ChainLinkState.NotContacted,
      is_member: who.isMember,
    };
  });
  return {
    hops: path.middle.length + 1,
    warm_steps: path.warmSteps,
    links: [
      { id: null, name: null, role: ChainLinkRole.You, state: null, is_member: true },
      ...bridges,
      {
        id: target.id,
        name: target.name,
        role: ChainLinkRole.Target,
        state: ChainLinkState.NotContacted,
        is_member: target.isMember,
      },
    ],
  };
}
