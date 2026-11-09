import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Retest 9 Nov (C7): the run searched saved notes for „კრევეტი" and „shrimp aquaculture",
 * a country and the second degree, never the owner's own labels — and Levan, saved as
 * „fish farm", was missed. An empty notes search now reads the labels, by meaning too.
 */
describe('a notes search that found nobody', () => {
  const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
  const handler = chat.slice(
    chat.indexOf("case 'search_by_insight': {"),
    chat.indexOf("case 'search_second_degree': {"),
  );

  it('searches the owner’s labels with the same words, only when the notes held nobody', () => {
    expect(handler).toContain('if (!foundNobody(answered)');
    expect(handler).toContain(
      "runLoggedSearch(\n        userId,\n        'tag',\n        insightQuery,\n        searchByTag,",
    );
  });

  it('says where the people were found, and keeps the empty answer when the labels are empty too', () => {
    expect(handler).toContain("found_in: 'owner_labels'");
    expect(handler).toContain('foundNobody(labelled)\n        ? answered');
  });
});
