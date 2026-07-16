// How a search result relates to the asking user, attached to every result row
// so the assistant can tell whose contact a person is instead of guessing:
//   direct        — the user's own contact (a tag/alias they or a contributor saved)
//   second_degree — reachable through a mutual (the `via` connector)
//   graph         — surfaced only by the network graph (no direct/second-degree tie)
// For a `direct` result, `saved_as` carries the user's OWN label for the contact
// (their alias), or null when they have the person via a tag but saved no name.
export const OWNERSHIP = {
  DIRECT: 'direct',
  SECOND_DEGREE: 'second_degree',
  GRAPH: 'graph',
} as const;

export type Ownership = (typeof OWNERSHIP)[keyof typeof OWNERSHIP];
