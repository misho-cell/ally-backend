import { batchesWithoutSharedPhones } from '../importBatches';
import { enqueueEnrichment, enrichmentQueueSize } from '../enrichmentQueue';

/** The tester's 47594: 0.7 cards a second, one after another, and a deploy cut the import. */
describe('cards are saved a few at a time (47594)', () => {
  const card = (name: string, ...phones: string[]): { name: string; phones: string[] } => ({
    name,
    phones,
  });

  it('every card is in exactly one batch, at most four to a batch, in order', () => {
    const cards = Array.from({ length: 10 }, (_, i) => card(`c${i}`, `+99555500000${i}`));
    const batches = batchesWithoutSharedPhones(cards, 4);
    expect(batches.map((b) => b.length)).toEqual([4, 4, 2]);
    expect(batches.flat()).toEqual(cards);
  });

  it('two cards for one number never share a batch', () => {
    const cards = [card('a', '+1'), card('b', '+1'), card('c', '+2'), card('d', '+2', '+3')];
    const batches = batchesWithoutSharedPhones(cards, 4);
    for (const batch of batches) {
      const phones = batch.flatMap((c) => c.phones);
      expect(new Set(phones).size).toBe(phones.length);
    }
    expect(batches.flat()).toHaveLength(4);
  });

  it('numbers written two ways are one number when a key is given', () => {
    const cards = [card('a', '+995 555 000 001'), card('b', '+995555000001')];
    const key = (p: string): string => p.replace(/\s/g, '');
    expect(batchesWithoutSharedPhones(cards, 4, key)).toHaveLength(2);
  });

  it('no cards, no batches', () => {
    expect(batchesWithoutSharedPhones([], 4)).toEqual([]);
  });
});

describe('enrichment runs two at a time (47594)', () => {
  it('a third task waits until one of the first two ends, and a failure stops nothing', async () => {
    const releases: Array<() => void> = [];
    const started: number[] = [];
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    for (let i = 0; i < 3; i++) {
      enqueueEnrichment(
        () =>
          new Promise<void>((resolve, reject) => {
            started.push(i);
            releases.push(i === 0 ? () => reject(new Error('enrich failed')) : resolve);
          }),
      );
    }
    expect(started).toEqual([0, 1]);
    expect(enrichmentQueueSize()).toEqual({ waiting: 1, running: 2 });
    releases[0]();
    await new Promise((r) => setImmediate(r));
    expect(started).toEqual([0, 1, 2]);
    releases[1]();
    releases[2]();
    await new Promise((r) => setImmediate(r));
    expect(enrichmentQueueSize()).toEqual({ waiting: 0, running: 0 });
  });
});
