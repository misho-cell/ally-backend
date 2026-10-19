import { readFileSync } from 'fs';
import { join } from 'path';
jest.mock('../../db/postgres/client', () => ({ __esModule: true, query: jest.fn() }));

import { queryTerms } from '../askBoundary.service';
import { ruledOutIn, scopeCovers } from '../ruledOutBridges';

/** #6358 (the tester's 68966): „not Gigi, he's abroad" / „not Tea, we quarrelled". */
const GIGI = { phone: '+995500000011', labels: ['გიგი ბერიძე', 'გიგი'] };
const TEA = { phone: '+995500000012', labels: ['თეა მაისურაძე'] };
const LIKA = { phone: '+995500000013', labels: ['Lika Osepashvili'] };
const PLAN = [GIGI, TEA, LIKA];

describe('#6358: the owner’s own line rules a person of the plan out', () => {
  it('reads a refusal next to the name, in either language and order', () => {
    expect(ruledOutIn("not Gigi, he's abroad", [{ ...GIGI, labels: ['Gigi'] }])).toEqual([
      '995500000011',
    ]);
    expect(ruledOutIn('გიგი არა, საზღვარგარეთაა', PLAN)).toEqual(['995500000011']);
    expect(ruledOutIn('თეა მაისურაძეს ნუ ვკითხავთ, ვიჩხუბეთ', PLAN)).toEqual(['995500000012']);
    expect(ruledOutIn('ლიკა ოსეფაშვილის გარდა ყველას ჰკითხე', PLAN)).toEqual(['995500000013']);
  });

  it('rules out both when both are refused, one clause each', () => {
    expect(ruledOutIn('გიგი არა, საზღვარგარეთაა. თეა მაისურაძე არა, ვიჩხუბეთ', PLAN)).toEqual([
      '995500000011',
      '995500000012',
    ]);
  });

  it('reads nothing into a „no" answering something else, nor a plain mention', () => {
    expect(ruledOutIn('არა, გიგიმ უკვე მითხრა', PLAN)).toEqual([]);
    expect(ruledOutIn('გიგიმ არ უპასუხა', PLAN)).toEqual([]);
    expect(ruledOutIn('გიგის ჰკითხე', PLAN)).toEqual([]);
  });

  it('names nobody when a refusing clause names two', () => {
    expect(ruledOutIn('არა გიგი არამედ თეა მაისურაძე', PLAN)).toEqual([]);
  });
});

describe('#6358: an exclusion covers a subject that shares its words', () => {
  const subject = queryTerms('ბანკში სესხის მოსაპოვებლად დახმარება');

  it('covers the same goal asked again in other words', () => {
    expect(scopeCovers('ბანკში სესხის აღება ბიზნესისთვის', subject)).toBe(true);
    expect(scopeCovers('ბანკი', subject)).toBe(true);
  });

  it('is not carried to another goal by one shared everyday word', () => {
    expect(scopeCovers('ბინის გაქირავებაში დახმარება', subject)).toBe(false);
  });
});

describe('#6358: wired where the run starts, searches and plans', () => {
  it('keeps the line before the run searches, and filters searches and the plan', () => {
    const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
    const plans = readFileSync(join(__dirname, '..', 'taskPlans.service.ts'), 'utf8');
    expect(chat).toContain('await keepRuledOutBridges(userId, threadId, userMessage)');
    expect(chat).toContain('ruledOutOnSubject(userId, line)');
    expect(plans).toContain(
      'const allowed = await withoutRuledOut(userId, withinBoundaries, boundarySubject);',
    );
  });
});
