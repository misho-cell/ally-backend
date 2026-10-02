/**
 * The tester's 1012 (A, 0 of 3): web-found phones in goal replies came out
 * „[hidden]", and the next line's list number with them. The final text was
 * scrubbed before the run's web numbers were marked as allowed.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { scrubFinal, webNumberSpellings, webNumbersWithSource, wrapNumbers } from '../chat.service';
import { scrubText, stripAllowedSpans } from '../privacyScrub';

const CHAT = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');

describe('the final text', () => {
  it('is never scrubbed before its web numbers are marked', () => {
    expect(CHAT).not.toContain('finalText = scrubText(extractText(response.content))');
    expect(CHAT).not.toContain('finalText = scrubText(rewritten.text)');
    expect(CHAT).not.toContain('scrubText(extractText(continuation.content))');
    expect(CHAT).toContain('finalText = scrubFinal(extractText(response.content), runId)');
  });

  it('still masks every number when there is no run to read allowances from', () => {
    expect(scrubFinal('ტელეფონი: 599 12 34 56', undefined)).toContain('[hidden]');
  });
});

describe('a marked page number beside a numbered list', () => {
  const held = new Map<string, string | null>();
  for (const f of webNumbersWithSource({
    results: [{ url: 'https://www.08.ge/x', snippet: 'ტელ: (431) 24 15 50, (431) 24 15 51.' }],
  })) {
    for (const s of webNumberSpellings(f.phone)) held.set(s, f.source);
  }

  it('keeps the number and the next item’s list number', () => {
    const out = stripAllowedSpans(
      scrubText(wrapNumbers('1. SpartDental\nტელეფონი: (431) 24 15 50\n\n2. GeoDentalTour', held)),
    );

    expect(out).toContain('24 15 50');
    expect(out).toContain('2. GeoDentalTour');
    expect(out).not.toContain('[hidden]');
  });
});
