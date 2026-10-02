import { readFileSync } from 'fs';
import { join } from 'path';
import { dietToolResult } from '../toolResultDiet';
import { withOthersSavedAs } from '../tools/searchByTag';

/**
 * Misho, 2 October — Giorgi's retest (thread 30328): Niko Vekua is in Giorgi's
 * phonebook as „Niko Vekua", and two other people have him as a lawyer. The
 * search found him, the diet cut him behind Giorgi's own matches, and the reply
 * named none of the eleven lawyers found that way. Misho: show him as I saved
 * him, and add that others have him as a lawyer.
 */
const own = (i: number): Record<string, unknown> => ({
  name: `Own Lawyer ${i}`,
  saved_as: `Own Lawyer ${i} Advokati`,
  tags: ['advokati'],
});
const othersOnly = (i: number): Record<string, unknown> => ({
  name: `Registered ${i}`,
  saved_as: `Saved As ${i}`,
  tags: ['niko'],
  found_by_others_labels: true,
});

describe('a contact found only through other people’s labels', () => {
  it('carries the words of the search as what others have them saved as', () => {
    expect(withOthersSavedAs(othersOnly(1), ' იურისტი ')).toEqual({
      ...othersOnly(1),
      others_saved_as: 'იურისტი',
    });
  });

  it('leaves the owner’s own match untouched', () => {
    expect(withOthersSavedAs(own(1), 'იურისტი')).toEqual(own(1));
  });

  it('is kept by the diet behind the owner’s own matches, not cut by them', () => {
    const results = [...Array.from({ length: 12 }, (_, i) => own(i)), othersOnly(1), othersOnly(2)];
    const out = dietToolResult({ found: true, results }, true) as { results: unknown[] };

    expect(out.results).toHaveLength(14);
    expect(out.results.slice(-2)).toEqual([othersOnly(1), othersOnly(2)]);
  });

  it('is kept up to ten, so one crowded word cannot swamp the reply', () => {
    const results = [own(1), ...Array.from({ length: 15 }, (_, i) => othersOnly(i))];
    const out = dietToolResult({ found: true, results }, true) as {
      results: Array<Record<string, unknown>>;
    };

    expect(out.results.filter((r) => r.found_by_others_labels === true)).toHaveLength(10);
    expect(out.results[0]).toEqual(own(1));
  });

  it('is named as the owner saved them, with what others have them as', () => {
    const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
    expect(chat).toContain('by `saved_as` exactly as the owner saved them');
    expect(chat).toContain('say that other people have them saved as `others_saved_as`');
    expect(chat).toContain('Never drop them');
  });
});
