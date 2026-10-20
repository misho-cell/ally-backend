jest.mock('../../db/postgres/client', () => ({ __esModule: true, query: jest.fn(), default: {} }));

import { planInSentences, TaskPlan, withAskablePeopleOnly } from '../taskPlans.service';

function plan(people: TaskPlan['people_to_involve']): TaskPlan {
  return { solved_when: '', routes: [], people_to_involve: people } as unknown as TaskPlan;
}

const BESO = { name: 'ბესო', phone: 'p1', route: 'r', reach: 'ok' as const };
const NINO = { name: 'ნინო', phone: 'p2', route: 'r', reach: 'not_member' as const };

/** #6304 (box 70023): beside the groups, nobody off Netai is said to have an assistant to talk to. */
describe('the sentence beside the two groups', () => {
  it('names only the people who can be asked', () => {
    const shown = withAskablePeopleOnly(plan([BESO, NINO]));
    expect(shown.people_to_involve.map((p) => p.name)).toEqual(['ბესო']);
    expect(planInSentences(shown, 'ka')).toContain('ბესოს ასისტენტს დაველაპარაკები');
    expect(planInSentences(shown, 'ka')).not.toContain('ნინო');
  });

  it('stays as it is when everyone, or nobody, can be asked', () => {
    const all = plan([BESO]);
    const none = plan([NINO]);
    expect(withAskablePeopleOnly(all)).toBe(all);
    expect(withAskablePeopleOnly(none)).toBe(none);
  });
});
