import { readFileSync } from 'fs';
import { join } from 'path';
import { buildFromTheWebMessage, withoutNamesakes } from '../openingSearch.service';

/**
 * The tester's 37569: asked about „რეზო ყიფშიძე", the web card offered „ზურა
 * ყიფშიძე" tied to the owner's contact „ზურა სანტექნიკი".
 */
const zura = new Map([
  ['ზურა ყიფშიძე', { kind: 'first_circle' as const, who: 'ზურა სანტექნიკი' }],
  ['Acme Ltd', { kind: 'first_circle' as const, who: 'ნინო' }],
]);

describe('a web lead with another first name than the person asked about', () => {
  it('does not reach the card', () => {
    const kept = withoutNamesakes('რეზო ყიფშიძეს როგორ დავუკავშირდე?', zura);
    expect([...kept.keys()]).toEqual(['Acme Ltd']);
    expect(buildFromTheWebMessage(withoutNamesakes('რეზო ყიფშიძე', zura)) ?? '').not.toContain(
      'ზურა',
    );
  });

  it('stays when the first name is the one asked about', () => {
    expect([...withoutNamesakes('ზურა ყიფშიძე', zura).keys()]).toEqual([
      'ზურა ყიფშიძე',
      'Acme Ltd',
    ]);
  });

  it('stays when the search names no person', () => {
    expect(withoutNamesakes('სანტექნიკოსი თბილისში', zura)).toBe(zura);
  });

  it('is applied to both the opening search and the model’s own web search', () => {
    const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
    expect(chat).toContain('noteWaysIn(runId, withoutNamesakes(goalText, found.waysIn));');
    expect(chat).toContain(
      "noteWaysIn(runId, withoutNamesakes(String(input['query'] ?? ''), waysIn));",
    );
  });
});
