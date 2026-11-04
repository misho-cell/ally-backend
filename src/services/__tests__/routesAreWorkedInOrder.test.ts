jest.mock('../../db/postgres/client', () => ({ __esModule: true, query: jest.fn() }));

import { readFileSync } from 'fs';
import { join } from 'path';
import {
  inRouteOrder,
  waveSize,
  WAVE_SIZE_REAL_WORK,
  worksRoutesInOrder,
} from '../askWaves.service';
import { routeOrderForPlan } from '../severalRoutes';
import { PlanPerson, TaskPlan, withRouteOrder } from '../taskPlans.service';

const SHORT = '+995500000002';
const WARM = '+995500000004';
const THIRD = '+995500000006';
const ELSEWHERE = '+995500000008';

const person = (name: string, phone: string): PlanPerson => ({ name, phone, route: 'r' });

const plan = (people: PlanPerson[]): TaskPlan => ({
  solved_when: 'met',
  routes: [{ name: 'r', status: 'waiting' } as never],
  people_to_involve: people,
  never_contact: [],
  real_work: true,
});

/**
 * #8845 (the founder, 4 Nov 22:58): when the owner hands the job over or
 * approves without choosing, Netai works the routes to one person in order —
 * the shortest first, then the warmer longer one, then the rest — the next
 * after a no or a quiet day, never asking again. The tester saw four bridges
 * asked at once.
 */
describe('#8845: the plan knows the order of its routes to one person', () => {
  const routes = [
    { to: 'Misho', firstLinkPhone: SHORT },
    { to: 'Misho', firstLinkPhone: WARM },
    { to: 'Misho', firstLinkPhone: THIRD },
    { to: 'Nino', firstLinkPhone: ELSEWHERE },
  ];

  it('takes the order the routes were found in, for the go-betweens the plan asks', () => {
    expect(routeOrderForPlan([THIRD, WARM, SHORT, ELSEWHERE], routes)).toEqual([
      '995500000002',
      '995500000004',
      '995500000006',
    ]);
  });

  it('has no order when the plan asks only one route to the person', () => {
    expect(routeOrderForPlan([WARM, ELSEWHERE], routes)).toEqual([]);
  });

  it('is stamped on the plan only while two of its go-betweens are still named', () => {
    const both = withRouteOrder(plan([person('a', SHORT), person('b', WARM)]), [
      '995500000002',
      '995500000004',
      '995500000006',
    ]);
    expect(both.route_order).toEqual(['995500000002', '995500000004']);
    const one = withRouteOrder(plan([person('a', SHORT)]), ['995500000002', '995500000004']);
    expect(one.route_order).toBeUndefined();
  });

  it('is never taken from the model: a stale order is dropped', () => {
    const stale = { ...plan([person('a', SHORT)]), route_order: ['1', '2'] };
    expect(withRouteOrder(stale, []).route_order).toBeUndefined();
  });
});

describe('#8845: the waves work those routes one at a time, in that order', () => {
  it('asks one go-between at a time, even for real work', () => {
    const ordered = { real_work: true, route_order: ['995500000002', '995500000004'] };
    expect(worksRoutesInOrder(ordered)).toBe(true);
    expect(waveSize(ordered as never)).toBe(1);
    expect(waveSize({ real_work: true } as never)).toBe(WAVE_SIZE_REAL_WORK);
  });

  it('puts the routes in their order ahead of everyone else', () => {
    const people = [
      person('elsewhere', ELSEWHERE),
      person('warm', WARM),
      person('third', THIRD),
      person('short', SHORT),
    ];
    const order = ['995500000002', '995500000004', '995500000006'];
    expect(inRouteOrder(people, order).map((p) => p.name)).toEqual([
      'short',
      'warm',
      'third',
      'elsewhere',
    ]);
    expect(inRouteOrder(people, undefined).map((p) => p.name)).toEqual(people.map((p) => p.name));
  });

  it('is wired: the run passes its routes to the plan, the waves read them', () => {
    const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
    expect(chat).toMatch(/runLang\(runId\),\s*planRouteOrder\(runId, input\['plan'\]\),\s*\);/);
    const waves = readFileSync(join(__dirname, '..', 'askWaves.service.ts'), 'utf8');
    expect(waves).toContain('plan.route_order,');
  });
});
