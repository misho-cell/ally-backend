import { readFileSync } from 'fs';
import { join } from 'path';
import { planInSentences, TaskPlan } from '../taskPlans.service';
import {
  isClosingQuestionVariant,
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
    // The tester's 957: no „label: value" lines either — one paragraph of sentences.
    expect(text).not.toContain(':');
    expect(text).not.toContain('\n');
    expect(text).not.toMatch(/\bv\d/);
    expect(text).not.toContain('awaiting your approval');
    expect(text).not.toContain('[waiting]');
    expect(text).not.toContain('Routes:');
  });

  /** D561 (Tornike, 1 October): the plan the owner reads no longer says when it counts as solved. */
  it('says how it will look and whom it will ask — never when it counts as solved', () => {
    const text = planInSentences(PLAN, 'en');
    expect(text).not.toContain('solved');
    expect(text).not.toContain('a reliable architect is found');
    expect(text).toContain('I will look through Your own contacts and The second circle.');
    expect(text).toContain('I will ask Netai Test 50 and Netai Test 54 (not on Netai');
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

  /** The tester's 963: the names in another script, the plan said, and the question at its end. */
  it('yes, when it ends the plan on the agreed question, whatever script the names are in', () => {
    const reply =
      'გეგმა ასეთია: მოგვარებულად ჩავთვლი, როცა გეყოლება სანდო იურისტი. ამისთვის ვკითხავ ' +
      'ნეტაი ტესტ 50-ს და ნეტაი ტესტ 54-ს.\n\nამ გეგმას მივყვე და ვიმოქმედო?';
    expect(replyCarriesPlan(reply, plan)).toBe(true);
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

  /** The tester's 966: web-found names in passing, no link, no phone (D542). */
  it('to show a web-found person in full or not at all', () => {
    for (const language of ['ka', 'en'] as const) {
      const note = planInYourReplyNote(language);
      expect(note).toContain('page link and the public phone');
      expect(note).toContain('Never a list of names in passing.');
    }
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
  /** The tester's 967/968: „Elindu", and „(press the buttons above)" with the buttons below. */
  it('is the last line — nothing written after it stays', () => {
    const q = 'ამ გეგმას მივყვე და ვიმოქმედო?';
    expect(withClosingQuestion(`გეგმა.\n\n${q}\n\nElindu`, 'ka')).toBe(`გეგმა.\n\n${q}`);
    expect(
      withClosingQuestion(`გეგმა.\n\n${q}\n\n(ზემოთ მოცემულ ღილაკებზე დააჭირე პასუხად.)`, 'ka'),
    ).toBe(`გეგმა.\n\n${q}`);
  });

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

describe('the plan reads as Georgian sentences', () => {
  it('puts the people in the dative and joins them with „და"', () => {
    const text = planInSentences(PLAN, 'ka');
    expect(text).toContain('ვკითხავ Netai Test 50-ს და');
    expect(text).toContain('ვეძებ ამ გზებით — Your own contacts და The second circle.');
    expect(text).not.toContain('კითხვას დავუსვამ:');
    // The note stays after the name, and only the name is put in its case.
    expect(text).toMatch(/Netai Test 54-ს \(Netai-ზე არ არის/);
  });
});

/** The tester's 1110 (34000): the model's own wording of the question, then the agreed one under it. */
describe('a closing question in other words', () => {
  const Q = 'ამ გეგმას მივყვე და ვიმოქმედო?';

  it('is recognised as the agreed question', () => {
    expect(isClosingQuestionVariant('ამ გეგმას მივყვე და ასე ვიმოქმედო?', Q)).toBe(true);
    expect(isClosingQuestionVariant('ვამტკიცებ თუ შევცვალოთ?', Q)).toBe(false);
    expect(isClosingQuestionVariant('ამ გეგმას მივყვე და ასე ვიმოქმედო.', Q)).toBe(false);
    // The tester's 1112 (34409): the agreed opening, then a clause of its own.
    expect(
      isClosingQuestionVariant(
        'ამ გეგმას მივყვე და ასევე გავაგრძელო ვების დონეზე ძიება, თუ მეტიც დაგჭირდება?',
        Q,
      ),
    ).toBe(true);
  });

  it('is said once, as the agreed question', () => {
    const body = 'ვაკეში ორი ვარიანტი ვიპოვე.';
    expect(withClosingQuestion(`${body}\n\nამ გეგმას მივყვე და ასე ვიმოქმედო?\n\n${Q}`, 'ka')).toBe(
      `${body}\n\n${Q}`,
    );
    expect(withClosingQuestion(`${body}\n\nამ გეგმას მივყვე და ასე ვიმოქმედო?`, 'ka')).toBe(
      `${body}\n\n${Q}`,
    );
  });

  it('leaves a reply with a different last question alone, adding the agreed one', () => {
    expect(withClosingQuestion('რომელ ქალაქში ხარ?', 'ka')).toBe(`რომელ ქალაქში ხარ?\n\n${Q}`);
  });
});

/** The tester's 1110 (33975): the server's plan line went before the findings. */
describe('the plan the server adds', () => {
  it('follows the findings and ends with the question', () => {
    const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
    expect(chat).toContain(
      'withClosingQuestion(`${reply.trimEnd()}\\n\\n${plan.text}`, runLang(runId));',
    );
  });
});
