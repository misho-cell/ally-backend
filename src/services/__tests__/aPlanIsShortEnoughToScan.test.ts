import { planInSentences, shortRouteName, TaskPlan } from '../taskPlans.service';

/**
 * Board #380 (Misho, 3 Oct): the plan the owner reads was too long to scan.
 * At most two routes, each cut to a short line, and at most three people.
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
      'Second circle',
    ],
    ['მაკა', 'ნანა', 'დათო', 'გია', 'ლევანი'],
  );

  it('names two routes, three people, and counts the rest (ka)', () => {
    expect(planInSentences(long, 'ka')).toBe(
      'ვეძებ ამ გზებით — Ask direct contacts who work in accounting…, ' +
        'Web search for licensed accountants და კიდევ ერთი. ' +
        'ვკითხავ მაკას, ნანას, დათოს და კიდევ 2 ადამიანს.',
    );
  });

  it('does the same in English', () => {
    expect(planInSentences(long, 'en')).toContain('and one more.');
    expect(planInSentences(long, 'en')).toContain('and 2 more people.');
  });

  it('leaves a short plan exactly as it was', () => {
    expect(planInSentences(plan(['Web search'], ['მაკა']), 'ka')).toBe(
      'ვეძებ ამ გზებით — Web search. ვკითხავ მაკას.',
    );
  });

  it('cuts a long route name at a whole word', () => {
    expect(shortRouteName('Ask direct contacts who work in accounting firms across Tbilisi')).toBe(
      'Ask direct contacts who work in accounting…',
    );
    expect(shortRouteName('Second circle')).toBe('Second circle');
  });

  it('is shorter than the 475-character test plan the row measured', () => {
    expect(planInSentences(long, 'ka').length).toBeLessThan(200);
  });
});
