jest.mock('../../db/postgres/client', () => ({ query: jest.fn(), __esModule: true }));

import { query } from '../../db/postgres/client';
import { PrematchSource, PrematchWord } from '../prematch.service';
import { answerRate, answerRatesFor, goalNamesPerson, orderCandidates } from '../waveOrder';

/** 1691 (A8): four candidates with known records come out in the defined order. */
const mockQuery = query as jest.MockedFunction<typeof query>;
const P = (name: string, phone: string): { name: string; phone: string } => ({ name, phone });
const ANA = P('ანა ტესტური', '+447700900201');
const BESO = P('ბესო ტესტური', '+447700900202');
const GIA = P('გია ტესტური', '+447700900203');
const DALI = P('დალი ტესტური', '+447700900204');
const d = (p: { phone: string }): string => p.phone.replace(/\D/g, '');
const word = (w: PrematchWord): { word: PrematchWord; source: PrematchSource } => ({
  word: w,
  source: PrematchSource.NothingKnown,
});

const words = new Map([
  [d(ANA), word(PrematchWord.AskHim)],
  [d(BESO), word(PrematchWord.LikelyYes)],
  [d(GIA), word(PrematchWord.LikelyYes)],
  [d(DALI), word(PrematchWord.NotHisField)],
]);
const rates = new Map([
  [d(BESO), { field: answerRate(1, 0, 4), overall: 0.5 }],
  [d(GIA), { field: answerRate(3, 0, 4), overall: 0.5 }],
]);

describe('the order of a wave', () => {
  it('class first, then the answer rate in the field; not_his_field last', () => {
    const order = orderCandidates([ANA, BESO, GIA, DALI], {
      words,
      rates,
      goalText: 'საბაჟო ბროკერი',
    });
    expect(order.map((p) => p.name)).toEqual([
      'გია ტესტური',
      'ბესო ტესტური',
      'ანა ტესტური',
      'დალი ტესტური',
    ]);
  });

  it('changing one record changes the order as expected', () => {
    const better = new Map(rates).set(d(BESO), { field: answerRate(4, 0, 4), overall: 0.5 });
    const order = orderCandidates([ANA, BESO, GIA, DALI], { words, rates: better, goalText: '' });
    expect(order[0].name).toBe('ბესო ტესტური');
  });

  it('the person the owner named himself is always first', () => {
    const order = orderCandidates([ANA, BESO, GIA, DALI], {
      words,
      rates,
      goalText: 'ჰკითხე დალი ტესტურს საბაჟოზე',
    });
    expect(order[0].name).toBe('დალი ტესტური');
    expect(goalNamesPerson('ჰკითხე დალი ტესტურს', 'დალი ტესტური')).toBe(true);
    expect(goalNamesPerson('ჰკითხე ვინმეს', 'დალი ტესტური')).toBe(false);
  });

  it('the answer rate is (yes + referred + 1) / (asked + 2)', () => {
    expect(answerRate(0, 0, 0)).toBe(0.5);
    expect(answerRate(3, 1, 6)).toBe(5 / 8);
  });
});

describe('the rates are read from the record', () => {
  it('per field and overall, kept as two numbers', async () => {
    mockQuery.mockResolvedValue({
      rows: [
        { phone: BESO.phone, field: 'საბაჟო ბროკერ', asked: 2, yes: 2, referred: 0 },
        { phone: BESO.phone, field: '', asked: 4, yes: 0, referred: 0 },
      ],
      rowCount: 2,
    } as never);
    const out = await answerRatesFor([BESO.phone], 'საბაჟო ბროკერ');
    expect(out.get(d(BESO))).toEqual({ field: 3 / 4, overall: 3 / 8 });
    const [sql, params] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('JOIN answer_stats s ON s.user_id = up."userId"');
    expect(params[1]).toBe(2_000);
  });
});
