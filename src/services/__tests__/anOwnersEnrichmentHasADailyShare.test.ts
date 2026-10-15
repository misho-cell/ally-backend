import {
  ENRICHMENT_CONCURRENCY,
  ENRICHMENTS_PER_OWNER_PER_DAY,
  takeEnrichmentAllowance,
} from '../enrichmentQueue';

/** F10 (the tester's 60358; Misho's yes to Q7): a hundred phonebooks in one launch hour. */
describe("an owner's daily enrichment share", () => {
  it('lets the first two hundred new numbers of a day be enriched, and no more', () => {
    const day = '2026-10-21';
    let allowed = 0;
    for (let i = 0; i < ENRICHMENTS_PER_OWNER_PER_DAY + 50; i += 1) {
      if (takeEnrichmentAllowance(501, day)) allowed += 1;
    }
    expect(ENRICHMENTS_PER_OWNER_PER_DAY).toBe(200);
    expect(allowed).toBe(200);
  });

  it('counts each owner on their own, and starts again the next day', () => {
    const day = '2026-10-22';
    for (let i = 0; i < ENRICHMENTS_PER_OWNER_PER_DAY; i += 1) takeEnrichmentAllowance(502, day);
    expect(takeEnrichmentAllowance(502, day)).toBe(false);
    expect(takeEnrichmentAllowance(503, day)).toBe(true);
    expect(takeEnrichmentAllowance(502, '2026-10-23')).toBe(true);
  });

  it('runs four at a time', () => {
    expect(ENRICHMENT_CONCURRENCY).toBe(4);
  });
});
