import { readFileSync } from 'fs';
import { join } from 'path';
import { planWaitsForTheOwner, withPlanDecisionAgain } from '../planDecisionReoffer';

/**
 * The tester's 56697 (13 Oct, 2 of 3): „რატომ თამაზი?" about a proposed plan was
 * answered with no question and no buttons, and the plan's own buttons were gone.
 */
const WAITING = {
  plan_proposed: { routes: [] },
  plan_approved_at: null,
  plan_change_requested_at: null,
};
const WHY =
  'ამ ეტაპზე თამაზი ერთადერთი ადამიანია შენს კონტაქტებში, ვისზეც ჩანაწერი მზარეულებს უკავშირდება.';

describe('a plan that still waits for the owner', () => {
  it('asks again under a reply that asks and offers nothing', () => {
    expect(withPlanDecisionAgain(WHY, undefined, WAITING, 'ka')).toEqual({
      text: `${WHY}\n\nდავიწყო?`,
      choices: ['ვადასტურებ', 'შევცვალოთ'],
    });
  });

  it('leaves a reply that asks its own question, or offers its own buttons, as it is', () => {
    expect(
      withPlanDecisionAgain(`${WHY} გინდა სხვა ვინმე მოვძებნო?`, [], WAITING, 'ka'),
    ).toBeNull();
    expect(withPlanDecisionAgain(WHY, ['კი', 'არა'], WAITING, 'ka')).toBeNull();
  });

  it('is nothing once the plan is approved, asked to change, or never proposed', () => {
    expect(planWaitsForTheOwner(null)).toBe(false);
    expect(planWaitsForTheOwner({ ...WAITING, plan_approved_at: '2026-10-13T10:42:00Z' })).toBe(
      false,
    );
    expect(
      planWaitsForTheOwner({ ...WAITING, plan_change_requested_at: '2026-10-13T10:42:00Z' }),
    ).toBe(false);
    expect(planWaitsForTheOwner({ ...WAITING, plan_proposed: null })).toBe(false);
  });

  it('is wired for an owner’s turn that did not itself propose a plan', () => {
    const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
    expect(chat).toContain(
      '!ownerAbsent && replySafe && earlySolved === null && !runPlanForReply.has(runId)',
    );
    expect(chat).toContain('withPlanDecisionAgain(cleanedFinal, choices, task, language)');
  });
});
