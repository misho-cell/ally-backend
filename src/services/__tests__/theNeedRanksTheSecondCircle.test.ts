import { readFileSync } from 'fs';
import { join } from 'path';
import { needPattern } from '../tools/needWords';
import { buildMeaningWordGroups } from '../tools/transliterate';

/** #8647 (the tester's 81446; example 3, the TBC loan test). */
describe('the owner’s need ranks equal matches in the second circle', () => {
  const searched = buildMeaningWordGroups('თიბისი ბანკი');

  it('takes the need words from the owner’s line, not the searched words', () => {
    const p = needPattern('თიბისში ვინმე მჭირდება, ბიზნეს სესხი გამეჭედა', searched);
    expect(p).not.toBeNull();
    expect(p).toContain('სესხ');
    expect(p).not.toContain('ბანკ');
  });

  it('is empty when the owner’s line says nothing beyond the search', () => {
    expect(needPattern('', searched)).toBeNull();
    expect(needPattern('თიბისი ბანკი', searched)).toBeNull();
  });

  it('ranks after the searched words and before the friends’ count, in both orderings', () => {
    const code = readFileSync(join(__dirname, '..', 'tools', 'searchSecondDegree.ts'), 'utf8');
    expect(code).toMatch(/ORDER BY \(\$\{wordHits\}\) DESC,\s+need_hit DESC,/u);
    expect(code).toContain(
      'ORDER BY r.word_hits DESC, r.need_hit DESC, r.evidence DESC, r.bridge_rank DESC',
    );
    const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
    expect(chat).toMatch(
      /searchSecondDegree\(\s*uid,\s*q,\s*runId === undefined \? '' : \(runOwnerLine\.get\(runId\) \?\? ''\),/u,
    );
  });
});
