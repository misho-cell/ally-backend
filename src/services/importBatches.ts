/**
 * The tester's 47594 (8 Oct): a first import ran at about 0.7 contacts a
 * second — one card after another — so 500 cards took twelve minutes, and a
 * deploy in that window cut it. Cards are now saved a few at a time.
 *
 * Two cards that share a number never go in the same batch: each save checks
 * „is this row there yet?" before it writes, and two at once could both see
 * „no" and write it twice. Order is kept otherwise.
 */
export const IMPORT_BATCH_SIZE = 4;

export interface PhoneCard {
  readonly phones: readonly string[];
}

/** The cards in batches of at most `size`, no number appearing twice in one batch. */
export function batchesWithoutSharedPhones<T extends PhoneCard>(
  cards: readonly T[],
  size: number = IMPORT_BATCH_SIZE,
  key: (phone: string) => string = (phone) => phone,
): T[][] {
  const batches: T[][] = [];
  let waiting: readonly T[] = cards;
  while (waiting.length > 0) {
    const batch: T[] = [];
    const taken = new Set<string>();
    const later: T[] = [];
    for (const card of waiting) {
      const keys = card.phones.map(key);
      if (batch.length < size && !keys.some((k) => taken.has(k))) {
        batch.push(card);
        keys.forEach((k) => taken.add(k));
      } else {
        later.push(card);
      }
    }
    batches.push(batch);
    waiting = later;
  }
  return batches;
}
