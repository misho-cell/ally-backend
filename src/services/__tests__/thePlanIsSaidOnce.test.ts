import { readFileSync } from 'fs';
import { join } from 'path';
import { planInSentences, TaskPlan } from '../taskPlans.service';
import {
  planInYourReplyNote,
  replyAsksForApproval,
  replyCarriesPlan,
  withClosingQuestion,
} from '../chat.service';

/**
 * ROW 279 — Tornike, 1 October (D520): a new goal's plan appeared twice, first
 * as a server card that read like a form („v1", field labels), then in the
 * reply. The plan now appears ONCE, in Netai's own words, with the approve /
 * change buttons under it. Row 101 stays true: when the reply does not carry
 * the plan, the server adds it — in plain sentences, never the form.
 */
const PLAN: TaskPlan = {
  solved_when: 'a reliable architect is found and you have talked to them.',
  routes: [
    { name: 'Your own contacts', status: 'waiting' },
    { name: 'The second circle', status: 'waiting' },
  ],
  people_to_involve: [
    { name: 'Netai Test 50', route: 'Your own contacts' },
    { name: 'Netai Test 54', route: 'Your own contacts', reach: 'not_member' },
  ],
  never_contact: [],
} as unknown as TaskPlan;

describe('the plan in plain sentences', () => {
  it('has no version, no form heading and no bracketed status', () => {
    const text = planInSentences(PLAN, 'en');
    expect(text).not.toMatch(/\bv\d/);
    expect(text).not.toContain('awaiting your approval');
    expect(text).not.toContain('[waiting]');
    expect(text).not.toContain('Routes:');
  });

  it('says what solved means, how it will look, and whom it will ask', () => {
    const text = planInSentences(PLAN, 'en');
    expect(text).toContain('I will count it solved when: a reliable architect is found');
    expect(text).toContain('Your own contacts; The second circle.');
    expect(text).toContain('Netai Test 50, Netai Test 54 (not on Netai');
  });

  it('says it is writing to nobody when the plan names nobody', () => {
    const text = planInSentences({ ...PLAN, people_to_involve: [] }, 'ka');
    expect(text).toContain('ჯერ არავის ვწერ.');
  });
});

describe('does the reply carry the plan', () => {
  const plan = { text: 'x', names: ['Netai Test 50', 'Netai Test 54'] };

  it('yes, when it names everyone and says more than a line', () => {
    const reply =
      'I will look among your own contacts first and then the second circle. I would ask ' +
      'Netai Test 50 directly, and Netai Test 54 once they join. Shall I go ahead?';
    expect(replyCarriesPlan(reply, plan)).toBe(true);
  });

  it('no, when it only asks for the yes', () => {
    expect(replyCarriesPlan('Shall I go ahead with this plan?', plan)).toBe(false);
  });

  it('no, when someone the plan will ask is missing', () => {
    const reply = `${'I will look among your contacts first, then the second circle. '.repeat(2)}Netai Test 50 first.`;
    expect(replyCarriesPlan(reply, plan)).toBe(false);
  });
});

describe('what the model is told', () => {
  it('to write it once, in its own words, without a form', () => {
    const note = planInYourReplyNote('en');
    expect(note).toContain('ONCE, in your own words');
    expect(note).toContain('No version number, no headings, no field labels');
    expect(note).toContain('present_choices');
  });

  /** The tester's 941 (D520): every plan ends on the agreed question. */
  it('to end the plan on the agreed question, which the plan text itself does not carry', () => {
    expect(planInYourReplyNote('ka')).toContain('„ამ გეგმას მივყვე და ვიმოქმედო?"');
    // The tester's 957: the plan text itself never carries the question — it is
    // added only under an approve button.
    expect(planInSentences(PLAN, 'ka')).not.toContain('ამ გეგმას მივყვე და ვიმოქმედო?');
  });
});

describe('where it is wired', () => {
  const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
  const handler = chat.slice(chat.indexOf("case 'propose_task_plan':"));
  const block = handler.slice(0, handler.indexOf("case 'approve_task_plan':"));

  it('writes no form card any more', () => {
    expect(block).not.toContain('renderPlan(');
  });

  it('keeps a server message only for a goal in another thread, in sentences', () => {
    expect(block).toContain('if (goalThreadId !== threadId) {');
    expect(block).toContain('scrubText(wrapAllowedNumbers(plainPlan, runId))');
  });

  it('hands the model the plan to show, and adds it when the reply left it out', () => {
    expect(block).toContain('show_plan: planInYourReplyNote(runLang(runId))');
    expect(chat).toContain('effectiveFinal = withPlanInReply(runId, effectiveFinal, choices);');
    const clear = chat.slice(chat.indexOf('function clearRunState'));
    expect(clear.slice(0, 1400)).toContain('runPlanForReply.delete(runId)');
  });
});

describe('the agreed question under the plan', () => {
  it('is added when the reply leaves it out, and never twice', () => {
    expect(withClosingQuestion('The plan, in words.', 'en')).toBe(
      'The plan, in words.\n\nShall I follow this plan and act on it?',
    );
    const once = withClosingQuestion('გეგმა.\n\nამ გეგმას მივყვე და ვიმოქმედო?', 'ka');
    expect(once.match(/მივყვე/g)).toHaveLength(1);
  });
});

/**
 * The tester's 954: „ამ გეგმას მივყვე და ვიმოქმედო?" was added under a reply of
 * web leads whose buttons were its own („საკმარისია, გმადლობთ" …) — no plan,
 * no approve. The question and the plan fallback belong only to a reply that
 * asks for the plan to be approved.
 */
describe('only a reply that asks for approval is a plan reply', () => {
  it('reads the approve button among the offered choices', () => {
    expect(replyAsksForApproval(['ვამტკიცებ', 'შევცვალოთ'])).toBe(true);
    expect(replyAsksForApproval(['საკმარისია, გმადლობთ', 'გააგრძელე მოძებნა'])).toBe(false);
    expect(replyAsksForApproval(null)).toBe(false);
  });

  it('is checked before anything is added to the reply', () => {
    const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
    const fn = chat.slice(chat.indexOf('function withPlanInReply('));
    expect(fn.slice(0, 900)).toContain('if (!replyAsksForApproval(offered)) return reply;');
  });
});
