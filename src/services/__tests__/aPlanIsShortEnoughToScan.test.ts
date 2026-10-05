import { planInSentences, TaskPlan } from '../taskPlans.service';

/**
 * Board #380 (Misho, 3 Oct): the plan the owner reads was too long to scan —
 * at most three people, the rest counted. D663 (the founder, 5 Oct): one human
 * sentence about whose assistant Netai will talk to; no routes, no „paths".
 */
const plan = (routes: string[], people: string[]): TaskPlan =>
  ({
    routes: routes.map((name) => ({ name, status: 'running' })),
    people_to_involve: people.map((name) => ({ name })),
    solved_when: 'x',
  }) as unknown as TaskPlan;

describe('the plan text the owner reads', () => {
  const long = plan(
    [
      'Ask direct contacts who work in accounting firms across Tbilisi and Batumi',
      'Web search for licensed accountants',
    ],
    ['მაკა', 'ნანა', 'დათო', 'გია', 'ლევანი'],
  );

  it('names three people’s assistants and counts the rest (ka), with no route', () => {
    expect(planInSentences(long, 'ka')).toBe(
      'მაკას, ნანას, დათოს და კიდევ 2 ადამიანის ასისტენტებს დაველაპარაკები და შევეცდები, ეს მოვაგვარო.',
    );
  });

  it('does the same in English', () => {
    const text = planInSentences(long, 'en');
    expect(text).toContain("and 2 more people's assistants");
    expect(text).not.toContain('look through');
  });

  it('speaks of one assistant for one person (D663)', () => {
    expect(planInSentences(plan(['Web search'], ['ლიკა']), 'ka')).toBe(
      'ლიკას ასისტენტს დაველაპარაკები და შევეცდები, ეს მოვაგვარო.',
    );
  });

  it('is shorter than the 475-character test plan the row measured', () => {
    expect(planInSentences(long, 'ka').length).toBeLessThan(200);
  });
});
