import { geoName } from '../georgianCase';
import { georgianScriptName } from '../georgianScriptName';
import { readFileSync } from 'fs';
import { join } from 'path';
import { planInSentences, TaskPlan } from '../taskPlans.service';
import {
  isClosingQuestionVariant,
  planInYourReplyNote,
  replyAsksForApproval,
  replyNamesEveryone,
  planReplyText,
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
    // #7235 reopened: the not-on-Netai person sits on the approved group line below.
    const [paragraph, ...rest] = planInSentences(PLAN, 'en').split('\n');
    const text = paragraph;
    // The tester's 957: no „label: value" lines either — one paragraph of sentences.
    expect(text).not.toContain(':');
    expect(rest).toEqual([
      '• Not on Netai — if you like, I will write the invitation for you: Netai Test 54',
    ]);
    expect(text).not.toMatch(/\bv\d/);
    expect(text).not.toContain('awaiting your approval');
    expect(text).not.toContain('[waiting]');
    expect(text).not.toContain('Routes:');
  });

  /** D561 (Tornike, 1 October): the plan the owner reads no longer says when it counts as solved. */
  it('says whose assistants it will talk to — never routes or when it counts as solved (D663)', () => {
    const text = planInSentences(PLAN, 'en');
    expect(text).not.toContain('solved');
    expect(text).not.toContain('a reliable architect is found');
    expect(text).not.toContain('look through');
    // #7235 reopened (founder, 63992): only someone whose assistant can be asked is in this sentence.
    expect(text).toContain("I will talk to Netai Test 50's assistant");
    expect(text).not.toContain("Netai Test 54's");
  });

  it('says it is writing to nobody when the plan names nobody', () => {
    const text = planInSentences({ ...PLAN, people_to_involve: [] }, 'ka');
    expect(text).toContain('ჯერ არავის ვწერ.');
  });
});

/** #8779 c: the one structural check — everyone the plan writes to is named. */
describe('does the reply name everyone the plan writes to', () => {
  const plan = { text: 'x', names: ['Lika Pirveli', 'Nika Meore'] };

  it('yes, when it names everyone', () => {
    expect(replyNamesEveryone('I would ask Lika directly, and Nika after her.', plan)).toBe(true);
  });

  it('yes, with the names in Georgian script and a case ending (the tester’s 963)', () => {
    expect(replyNamesEveryone('ჯერ ლიკას ვკითხავ, მერე ნიკას.', plan)).toBe(true);
  });

  it('no, when it only asks for the yes', () => {
    expect(replyNamesEveryone('Shall I go ahead with this plan?', plan)).toBe(false);
  });

  it('no, when someone the plan will ask is missing', () => {
    expect(replyNamesEveryone('I would ask Lika first.', plan)).toBe(false);
  });
});

describe('what the model is told', () => {
  it('to write it once, in its own words, without a form', () => {
    const note = planInYourReplyNote('en');
    expect(note).toContain('ONCE, as ONE human sentence');
    // D663: never the text it will send, never machine words.
    expect(note).toContain('Never show the text you will send');
    expect(note).toContain('ONE question only');
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
    expect(planInYourReplyNote('ka')).toContain('„დავიწყო?"');
    // The tester's 957: the plan text itself never carries the question — it is
    // added only under an approve button.
    expect(planInSentences(PLAN, 'ka')).not.toContain('დავიწყო?');
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
    expect(chat).toContain('? withPlanInReply(runId, effectiveFinal, choices)');
    const clear = chat.slice(chat.indexOf('function clearRunState'));
    expect(clear.slice(0, 1400)).toContain('runPlanForReply.delete(runId)');
  });
});

describe('the agreed question under the plan', () => {
  /** The tester's 967/968: „Elindu", and „(press the buttons above)" with the buttons below. */
  it('is the last line — nothing written after it stays', () => {
    const q = 'დავიწყო?';
    expect(withClosingQuestion(`გეგმა.\n\n${q}\n\nElindu`, 'ka')).toBe(`გეგმა.\n\n${q}`);
    expect(
      withClosingQuestion(`გეგმა.\n\n${q}\n\n(ზემოთ მოცემულ ღილაკებზე დააჭირე პასუხად.)`, 'ka'),
    ).toBe(`გეგმა.\n\n${q}`);
  });

  it('is added when the reply leaves it out, and never twice', () => {
    expect(withClosingQuestion('The plan, in words.', 'en')).toBe(
      'The plan, in words.\n\nShall I start?',
    );
    const once = withClosingQuestion('გეგმა.\n\nდავიწყო?', 'ka');
    expect(once.match(/დავიწყო/g)).toHaveLength(1);
    // D663: a model still writing the earlier question gets it replaced, not doubled.
    expect(withClosingQuestion('გეგმა.\n\nამ გეგმას მივყვე და ვიმოქმედო?', 'ka')).toBe(
      'გეგმა.\n\nდავიწყო?',
    );
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
    expect(fn.slice(0, 900)).toContain('if (!replyAsksForApproval(offered)) return written;');
  });
});

describe('the plan reads as Georgian sentences', () => {
  it('puts the people in the genitive, joins them with „და", and names their assistants (D663)', () => {
    const text = planInSentences(PLAN, 'ka');
    // #7231: in Georgian script, as the sent line names the same person (D859).
    expect(text).toContain(`${geoName(georgianScriptName('Netai Test 50'), 'gen')} ასისტენტს`);
    expect(text).toContain('ასისტენტს დაველაპარაკები');
    expect(text).not.toContain('ვეძებ ამ გზებით');
    expect(text).not.toContain('კითხვას დავუსვამ:');
    // #7235 reopened: not on Netai is said on the approved group line, never as an assistant.
    expect(text).toContain('• Netai-ზე არ არიან — თუ გინდა, მოსაწვევს მოგიმზადებ: Netai Test 54');
    expect(text).not.toContain(`${geoName(georgianScriptName('Netai Test 54'), 'gen')}`);
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

  it('is said once, as the agreed question — the earlier wording and its variants replaced (D663)', () => {
    const body = 'ვაკეში ორი ვარიანტი ვიპოვე.';
    const AGREED = 'დავიწყო?';
    expect(
      withClosingQuestion(`${body}\n\nამ გეგმას მივყვე და ასე ვიმოქმედო?\n\n${AGREED}`, 'ka'),
    ).toBe(`${body}\n\n${AGREED}`);
    expect(withClosingQuestion(`${body}\n\nამ გეგმას მივყვე და ასე ვიმოქმედო?`, 'ka')).toBe(
      `${body}\n\n${AGREED}`,
    );
  });

  it('leaves a reply that ends on a question of its own alone (#8779 c)', () => {
    expect(withClosingQuestion('რომელ ქალაქში ხარ?', 'ka')).toBe('რომელ ქალაქში ხარ?');
  });
});

/** The tester's 1110 (33975): the server's plan line went before the findings. */
describe('the plan the server adds', () => {
  const plan = { text: 'ლიკას ასისტენტს დაველაპარაკები.', names: ['Lika Pirveli'] };

  it('goes under the model’s words when they leave someone out, ending on the question', () => {
    expect(planReplyText('სამი ნოტარიუსი ვიპოვე.', plan, 'ka')).toBe(
      `სამი ნოტარიუსი ვიპოვე.\n\n${plan.text}\n\nდავიწყო?`,
    );
  });

  it('stands alone, on the question, when the reply is empty (2909)', () => {
    expect(planReplyText('', plan, 'ka')).toBe(`${plan.text}\n\nდავიწყო?`);
  });

  it('is not added when the model’s words name everyone (#8779 c)', () => {
    expect(planReplyText('ლიკას ვკითხავ, იცნობს თუ არა ნოტარიუსს.', plan, 'ka')).toBe(
      'ლიკას ვკითხავ, იცნობს თუ არა ნოტარიუსს.\n\nდავიწყო?',
    );
  });
});

/** D663: „this tie shows with a weak signal" reached the founder. */
describe('the second-circle search', () => {
  it('keeps its signal numbers away from the owner', () => {
    const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
    expect(chat).toContain('never tell the owner about a ');
  });
});
