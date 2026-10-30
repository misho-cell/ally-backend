import { planInSentences, TaskPlan } from '../taskPlans.service';
import { introPlanOnly } from '../planJustification';
import { OwnerTieReason } from '../ownerTies';
import { introTargetSentence } from '../introTargetSentence';

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
    // #7235 reopened: nobody's assistant to ask — the approved not-on-Netai line, no „I will talk to".
    expect(text).toContain('Not on Netai — if you like, I will write the invitation for you: Nika');
    expect(text).not.toContain('I will talk to');
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

describe('a plan through one close bridge (the tester\u2019s 65642)', () => {
  const planInput = {
    routes: [{ name: 'r', introductions: [{ via_phone: '+111', to_name: 'ზურაბი' }] }],
  };

  it('says why in the one-bridge sentence too', () => {
    const sentence = introTargetSentence(
      planInput,
      [{ name: 'ნიკა', phone: '+111', reach: 'ok', tie: OwnerTieReason.SaidClose }],
      'ka',
      [{ name: 'ზურაბი', viaPhones: ['+111'] }],
    );
    expect(sentence).toContain('ნიკას (შენი ახლო ადამიანი) ასისტენტს დაველაპარაკები');
  });

  it('says nothing more for a plain bridge', () => {
    const sentence = introTargetSentence(
      planInput,
      [{ name: 'ნიკა', phone: '+111', reach: 'ok' }],
      'ka',
      [{ name: 'ზურაბი', viaPhones: ['+111'] }],
    );
    expect(sentence).toMatch(/^ნიკას ასისტენტს დაველაპარაკები/u);
  });
});

describe('#7235 reopened (founder, 63992): an old account is never an assistant to ask', () => {
  it('puts a never-opened account on the not-on-Netai line, beside the ones whose assistant is asked', () => {
    const text = planInSentences(
      plan([
        { name: 'ლევანი', reach: 'ok' },
        { name: 'მამუკა', reach: 'never_opened' },
      ]),
      'ka',
    );
    expect(text).toContain('ლევანის ასისტენტს დაველაპარაკები');
    expect(text).toContain('• Netai-ზე არ არიან — თუ გინდა, მოსაწვევს მოგიმზადებ: მამუკა');
    expect(text).not.toContain('მამუკას');
  });
});
