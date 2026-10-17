import { planInSentences, TaskPlan } from '../taskPlans.service';
import { introPlanOnly } from '../planJustification';
import { OwnerTieReason } from '../ownerTies';

/**
 * #5479 (the tester's 65473): the close bridge came first 6 of 6, but no plan
 * said why — D739 keeps one sentence, so the reason goes inside it.
 */
const plan = (people: object[]): TaskPlan =>
  ({ routes: [], people_to_involve: people, solved_when: 'x' }) as unknown as TaskPlan;

describe('a plan with a close bridge', () => {
  it('names why after the bridge’s name', () => {
    const text = planInSentences(
      plan([
        { name: 'ნიკა', tie: OwnerTieReason.SaidClose, reach: 'ok' },
        { name: 'ანა', reach: 'ok' },
      ]),
      'ka',
    );
    expect(text).toBe(
      'ნიკას (შენი ახლო ადამიანი) და ანას ასისტენტებს დაველაპარაკები და შევეცდები, ეს მოვაგვარო.',
    );
  });

  it('says what the owner must know first when the bridge cannot be asked', () => {
    const text = planInSentences(
      plan([{ name: 'Nika', tie: OwnerTieReason.Family, reach: 'not_member' }]),
      'en',
    );
    expect(text).toContain('(not on Netai — will need an invitation)');
    expect(text).not.toContain('(your family)');
  });

  it('is said in the server’s sentence, not the model’s own without the note', () => {
    const server = planInSentences(
      plan([{ name: 'ნიკა', tie: OwnerTieReason.SaidClose, reach: 'ok' }]),
      'ka',
    );
    const reply = 'ნიკას ასისტენტს დაველაპარაკები და შევეცდები, ეს მოვაგვარო. დავიწყო?';
    expect(introPlanOnly(reply, { text: server, names: ['ნიკა'] })).toBe(`${server} დავიწყო?`);
  });

  it('leaves the model’s own sentence when the server has nothing more to say', () => {
    const server = planInSentences(plan([{ name: 'ნიკა', reach: 'ok' }]), 'ka');
    const reply = 'ნიკას ასისტენტს დაველაპარაკები და შევეცდები, მოვაგვარო. დავიწყო?';
    expect(introPlanOnly(reply, { text: server, names: ['ნიკა'] })).toBe(reply);
  });
});
