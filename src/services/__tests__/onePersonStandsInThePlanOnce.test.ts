jest.mock('../../db/postgres/client', () => ({ query: jest.fn() }));

import { parsePlan, planInSentences } from '../taskPlans.service';

const ROUTE = { name: 'ჩემი კონტაქტები', status: 'waiting' };

function planWith(people: { name: string; phone: string }[]): unknown {
  return {
    solved_when: 'სესხის განაცხადს პასუხი გაეცა',
    routes: [ROUTE],
    people_to_involve: people.map((p) => ({ ...p, route: ROUTE.name })),
  };
}

/** 5251 (Misho's own case, goal 26072): the same classmate stood in the plan twice. */
describe('one person stands in the plan once', () => {
  it('keeps the first of two entries for one number, whatever the label', () => {
    const parsed = parsePlan(
      planWith([
        { name: 'თიკო ბერიძე', phone: '+995599000001' },
        { name: 'კლასელი თიკო', phone: '995599000001' },
        { name: 'ლევან ტესტაძე', phone: '+995599000002' },
      ]),
    );

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.people_to_involve.map((p) => p.name)).toEqual([
      'თიკო ბერიძე',
      'ლევან ტესტაძე',
    ]);
    expect(planInSentences(parsed.value, 'ka')).not.toContain('კლასელი თიკო');
  });

  it('keeps two different people with the same first name', () => {
    const parsed = parsePlan(
      planWith([
        { name: 'ნინო ბერიძე', phone: '+995599000003' },
        { name: 'ნინო კაპანაძე', phone: '+995599000004' },
      ]),
    );
    expect(parsed.ok && parsed.value.people_to_involve).toHaveLength(2);
  });

  /** #7630 (thread 65511): one person on two numbers was named twice in the sentence. */
  it('names one person on two numbers once in the sentence', () => {
    const parsed = parsePlan(
      planWith([
        { name: 'თორნიკე აბულაძე', phone: '+995599000005' },
        { name: 'თორნიკე აბულაძე', phone: '+995599000006' },
        { name: 'ლევან ტესტაძე', phone: '+995599000002' },
      ]),
    );
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const sentence = planInSentences(parsed.value, 'ka');
    expect(sentence.match(/თორნიკე/gu)).toHaveLength(1);
    expect(sentence).toContain('ლევან');
    expect(sentence).not.toContain('კიდევ');
  });
});
