jest.mock('../../db/postgres/client', () => ({ __esModule: true, query: jest.fn() }));

import { query } from '../../db/postgres/client';
import { introsTargetName, planTargetName, routesOfOwnGoal } from '../routesBoard.service';

const mockQuery = query as jest.MockedFunction<typeof query>;

/** #6342 (Giorgi, G-087, goal 29308): Temur is not on Netai, and the paths ended at the helpers. */
const PLAN = {
  routes: [
    { name: 'თორნიკეს გზა', introduction: { to_name: 'თემურ ბოლოთაშვილი', via_phone: 'p1' } },
    { name: 'ბესოს გზა', introduction: { to_name: 'თემურ ბოლოთაშვილი', via_phone: 'p2' } },
  ],
};

describe('#6342: each path ends at the person it leads to', () => {
  it('reads the one person a plan’s routes lead to', () => {
    expect(planTargetName(PLAN, null)).toBe('თემურ ბოლოთაშვილი');
    expect(planTargetName(null, PLAN)).toBe('თემურ ბოლოთაშვილი');
  });

  it('names nobody when the plan names none or several', () => {
    expect(planTargetName({ routes: [{ name: 'ვებ ძებნა' }] })).toBeNull();
    expect(
      planTargetName({
        routes: [{ introduction: { to_name: 'თემური' } }, { introduction: { to_name: 'ნინო' } }],
      }),
    ).toBeNull();
    expect(planTargetName(null)).toBeNull();
  });

  it('puts it at the end of every question’s route, and an introduction keeps its own', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: 29308 }] } as never)
      .mockResolvedValueOnce({
        rows: [
          {
            id: 1,
            person_id: 11,
            name: 'თორნიკე',
            status: 'sent',
            answer: null,
            declined_at: null,
            seen_at: null,
            later_until: null,
            expired_at: null,
            updated_at: '2026-10-19T13:38:22Z',
          },
        ],
      } as never)
      .mockResolvedValueOnce({
        rows: [
          {
            id: 7,
            person_id: 12,
            name: 'ლიკა',
            status: 'accepted',
            target_name: 'თემურ ბოლოთაშვილი',
            updated_at: '2026-10-19T14:37:51Z',
          },
        ],
      } as never)
      .mockResolvedValueOnce({ rows: [{ plan: PLAN, plan_proposed: null }] } as never);
    const routes = await routesOfOwnGoal(501, 60691);
    expect(routes.map((r) => [r.person_name, r.target_name])).toEqual([
      ['თორნიკე', 'თემურ ბოლოთაშვილი'],
      ['ლიკა', 'თემურ ბოლოთაშვილი'],
    ]);
  });

  // Reopened 20 Oct (Giorgi's retest): no plan names a target; 29308's is on Lika's introduction.
  it('takes the one person the goal’s introductions name when the plan names none', () => {
    expect(introsTargetName(['თემურ ბოლოთაშვილი'])).toBe('თემურ ბოლოთაშვილი');
    expect(introsTargetName(['თემური', ' თემურ ბოლოთაშვილი '])).toBe('თემურ ბოლოთაშვილი');
    expect(introsTargetName(['თემური', 'ნინო ბერიძე'])).toBeNull();
    expect(introsTargetName([])).toBeNull();
  });

  it('ends every route at the introduction’s target on a plan named after the helpers', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: 29308 }] } as never)
      .mockResolvedValueOnce({
        rows: [
          {
            id: 1,
            person_id: 11,
            name: 'თორნიკე',
            status: 'sent',
            answer: null,
            declined_at: null,
            seen_at: null,
            later_until: null,
            expired_at: null,
            updated_at: '2026-10-19T13:38:22Z',
          },
          {
            id: 2,
            person_id: 13,
            name: 'თემური',
            status: 'sent',
            answer: null,
            declined_at: null,
            seen_at: null,
            later_until: null,
            expired_at: null,
            updated_at: '2026-10-19T13:40:00Z',
          },
        ],
      } as never)
      .mockResolvedValueOnce({
        rows: [
          {
            id: 7,
            person_id: 12,
            name: 'ლიკა',
            status: 'accepted',
            target_name: 'თემურ ბოლოთაშვილი',
            updated_at: '2026-10-19T14:37:51Z',
          },
        ],
      } as never)
      .mockResolvedValueOnce({
        rows: [{ plan: { routes: [{ name: 'თორნიკე აბულაძის გზა' }] }, plan_proposed: null }],
      } as never);
    const routes = await routesOfOwnGoal(501, 60691);
    expect(routes.map((r) => [r.person_name, r.target_name])).toEqual([
      ['თორნიკე', 'თემურ ბოლოთაშვილი'],
      ['თემური', null],
      ['ლიკა', 'თემურ ბოლოთაშვილი'],
    ]);
  });
});
