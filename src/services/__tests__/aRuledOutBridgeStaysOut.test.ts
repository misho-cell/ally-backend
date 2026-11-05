import { readFileSync } from 'fs';
import { join } from 'path';
jest.mock('../../db/postgres/client', () => ({ __esModule: true, query: jest.fn() }));

import { queryTerms } from '../askBoundary.service';
import { scopeCovers, scopeIsEverything } from '../ruledOutBridges';

describe('#6358: an exclusion covers a subject that shares its words', () => {
  const subject = queryTerms('ბანკში სესხის მოსაპოვებლად დახმარება');

  it('covers the same goal asked again in other words', () => {
    expect(scopeCovers('ბანკში სესხის აღება ბიზნესისთვის', subject)).toBe(true);
    expect(scopeCovers('ბანკი', subject)).toBe(true);
  });

  it('is not carried to another goal by one shared everyday word', () => {
    expect(scopeCovers('ბინის გაქირავებაში დახმარება', subject)).toBe(false);
  });

  it('covers every subject when the owner ruled the person out of all matters (69082)', () => {
    const notary = queryTerms('სანდო ნოტარიუსი მემკვიდრეობის საბუთებისთვის');
    for (const scope of [
      'ყველა საქმე',
      'ნებისმიერი საქმე',
      'ჩემი ყველა საქმე',
      'all matters',
      'any matter',
    ]) {
      expect(scopeIsEverything(scope)).toBe(true);
      expect(scopeCovers(scope, notary)).toBe(true);
    }
  });

  it('keeps „all" with a subject to that subject', () => {
    expect(scopeIsEverything('ყველა საბანკო საქმე')).toBe(false);
    expect(scopeIsEverything('all banking matters')).toBe(false);
    expect(scopeIsEverything('საქმე')).toBe(false);
  });
});

describe('#6358: wired where the run searches and plans', () => {
  it('filters searches and the plan; no refusal words are read any more (#8779 b, rule 35)', () => {
    const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
    const plans = readFileSync(join(__dirname, '..', 'taskPlans.service.ts'), 'utf8');
    expect(chat).not.toContain('keepRuledOutBridges');
    expect(chat).not.toContain('keepNeverInvolved');
    expect(chat).toContain('ruledOutOnSubject(userId, line)');
    expect(plans).toContain(
      'const allowed = await withoutRuledOut(userId, withinBoundaries, boundarySubject);',
    );
  });
});
