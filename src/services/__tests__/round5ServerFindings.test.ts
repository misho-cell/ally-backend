import { readFileSync } from 'fs';
import { join } from 'path';
import {
  claimsToHavePassedItOn,
  helperAskedAQuestion,
  HELPER_QUESTION_NUDGE,
  PASSED_ON_NUDGE,
} from '../replyGuards';
import { relatedProfessionWords } from '../professionFamilies';
import { whoseAsksWereThey } from '../taskAsks.service';

/**
 * The tester's 1100 (round 5, GPT writing the answers).
 */
const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');

describe('1 — „what is new?" with nothing new', () => {
  it('says so in the result instead of an item list nobody can read as empty', () => {
    expect(chat).toContain('const nothingNew = updates.length === 0 && curiosity === null;');
    expect(chat).toContain(
      '...(nothingNew && { nothing_new: true, nothing_new_note: NOTHING_NEW_NOTE }),',
    );
    expect(chat).toContain('never call those new answers');
  });
});

describe('2 — a plan reply carries the plan’s own buttons', () => {
  it('is applied to the run’s buttons before the reply is assembled', () => {
    // D626: a plan that names nobody takes the other branch, with no card.
    expect(chat).toContain('? planButtonsWhenMissing(runId, loopChoices)');
    const assembled = chat.indexOf('? withPlanInReply(runId, effectiveFinal, choices)');
    expect(chat.indexOf('? planButtonsWhenMissing(runId, loopChoices)')).toBeLessThan(assembled);
  });

  it('adds approve and change only when the reply has none, or has the closing question as one', () => {
    const fn = chat.slice(chat.indexOf('export function planButtonsWhenMissing('));
    const body = fn.slice(0, fn.indexOf('\n}\n'));
    expect(body).toContain('!runPlanForReply.has(runId) ||');
    // 1103 (33113): a plan the run itself approved gets no buttons and no second copy.
    expect(body).toContain('runPlanApprovedInRun.has(runId) ||');
    expect(body).toContain(
      'if ((offered ?? []).length > 0 && !asksTheClosingQuestion) return offered;',
    );
    expect(body).toContain('return [APPROVE_LABEL[language], CHANGE_LABEL[language]];');
  });
});

describe('4 — a helper’s assistant that claims a send that did not happen', () => {
  const guards = { claimsToHavePassedItOn, PASSED_ON_NUDGE };

  it('recognises the claim in Georgian and English', () => {
    expect(guards.claimsToHavePassedItOn('გადავეცი, პასუხი აქ მოვა.')).toBe(true);
    expect(guards.claimsToHavePassedItOn("I've passed it to her, the answer will come here.")).toBe(
      true,
    );
    expect(guards.claimsToHavePassedItOn('კარგი, რას ეტყვი მას?')).toBe(false);
    // The tester's 1105 (33298): the answer labelled, never sent.
    expect(guards.claimsToHavePassedItOn('გადასაცემი პასუხი: ჯემალ ფირცხალავა.')).toBe(true);
    expect(guards.claimsToHavePassedItOn('Answer to pass on: Jemal Pirtskhalava.')).toBe(true);
    expect(guards.claimsToHavePassedItOn('ვის ეძებ, ჯემალს თუ სხვას?')).toBe(false);
    // The tester's 1102 (i, 33119): the question written as an instruction, never sent.
    expect(
      guards.claimsToHavePassedItOn(
        'ქეთევანს ჰკითხე: რატომ სჭირდება მაკლერი და რაზე მუშაობს ახლა?',
      ),
    ).toBe(true);
    expect(guards.claimsToHavePassedItOn('Ask Ketevan: why does she need a broker?')).toBe(true);
    expect(guards.claimsToHavePassedItOn('რა გინდა, რომ ვკითხო?')).toBe(false);
    // The tester's 1145 (37854): the promise in the future tense.
    expect(guards.claimsToHavePassedItOn('ნოდარს გადავცემ: „ნანა სტომატოლოგი"')).toBe(true);
    expect(guards.claimsToHavePassedItOn("I'll pass it on to Nodar.")).toBe(true);
    expect(guards.claimsToHavePassedItOn('ამას არ გადავცემ, სანამ არ მეტყვი.')).toBe(false);
    expect(guards.claimsToHavePassedItOn('ნოდარს გადავუგზავნო?')).toBe(false);
  });

  it('asks once more with the tool named, and never relays the line itself', () => {
    expect(guards.PASSED_ON_NUDGE).toContain('send_answer_to_asker');
    expect(guards.PASSED_ON_NUDGE).toContain('confirmed=true');
    expect(chat).toContain("runModes.get(runId) === 'incoming_ask' && !runAnswerSent.has(runId)");
    expect(chat).toContain("const nudgeTurn = { role: 'user' as const, content: guardNudge };");
  });

  it('keeps the nudge out of the owner’s history like the others', () => {
    const set = chat.slice(chat.indexOf('export const MODEL_ONLY_NUDGES'));
    expect(set.slice(0, 200)).toContain('PASSED_ON_NUDGE');
  });
});

/** The tester's 1102 (round 1 of the loop). */
describe('1102 (a) — the second circle searches the profession’s other words', () => {
  it('knows the vet family', () => {
    expect(relatedProfessionWords('ვეტერინარი')).toContain('ვეტექიმი');
  });

  it('widens search_second_degree, at most three words, with the note', () => {
    const handler = chat.slice(chat.indexOf("case 'search_second_degree': {")).slice(0, 2000);
    expect(handler).toContain('(word) => searchSecondDegree(userId, word),');
    expect(handler).toContain('MAX_SECOND_CIRCLE_FAMILY_WORDS,');
    expect(chat).toContain('const MAX_SECOND_CIRCLE_FAMILY_WORDS = 3;');
  });
});

describe('1102 (f) — whose questions filled a helper’s day', () => {
  it('says they were the owner’s own when they were', () => {
    expect(whoseAsksWereThey([{ from_user_id: 41 }, { from_user_id: '41' }], '41')).toBe(
      'ყველა შენი საკუთარი კითხვა იყო',
    );
    expect(whoseAsksWereThey([{ from_user_id: 7 }, { from_user_id: 8 }], '41')).toBe(
      'სხვა ადამიანებისგან',
    );
    expect(whoseAsksWereThey([{ from_user_id: 41 }, { from_user_id: 8 }], '41')).toBe(
      '1 შენი საკუთარი, დანარჩენი სხვებისგან',
    );
  });
});

/** The tester's 1110 (33950): the helper's question back, lost whatever the model wrote. */
describe('a helper’s question back in a run that sent nothing', () => {
  it('is seen from the helper’s own line', () => {
    expect(helperAskedAQuestion('რატომ სჭირდება? რაზე მუშაობს?')).toBe(true);
    expect(helperAskedAQuestion('Why does she need it?')).toBe(true);
    expect(helperAskedAQuestion('არ ვიცი.')).toBe(false);
  });

  it('gets its own note naming the tool, kept out of the owner’s history', () => {
    expect(HELPER_QUESTION_NUDGE).toContain('send_answer_to_asker');
    expect(HELPER_QUESTION_NUDGE).toContain('confirmed=true');
    // D647 (37520): in the assistant's own words, and no „shall I forward it?".
    expect(HELPER_QUESTION_NUDGE).toContain('შენი სიტყვებით: მისი კითხვის აზრი, არა ციტატა');
    expect(HELPER_QUESTION_NUDGE).toContain('არ ჰკითხო „გადავუგზავნო?"');
    expect(HELPER_QUESTION_NUDGE).not.toContain('ზუსტად მისი სიტყვებით');
    const set = chat.slice(chat.indexOf('export const MODEL_ONLY_NUDGES'));
    expect(set.slice(0, 200)).toContain('HELPER_QUESTION_NUDGE');
    expect(chat).toContain('(claimedASendThatDidNotHappen ||\n      helperQuestionUnsent ||');
  });
});

/** The tester's 1111 (34118): „I passed it on" then „sorry, nothing was passed on", in one reply. */
describe('the turn after a correction note', () => {
  it('replaces the mistaken first answer; a cliffhanger keeps its announcement', () => {
    expect(chat).toContain('const correctedTurn = guardNudge !== CLIFFHANGER_NUDGE;');
    expect(chat).toContain(
      'correctedTurn || repeated ? continuationText : `${finalText}\\n\\n${continuationText}`;',
    );
  });
});

/** The tester's 1131 (row 8, E6 36321): a relay is the helper's hand-on, not a missing send. */
describe('a relayed question counts as passed on', () => {
  const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');

  it('records a sent relay for the run and clears it with the run', () => {
    expect(chat).toContain('if (relayed.sent && runId) runRelaySent.add(runId);');
    expect(chat).toContain('runRelaySent.delete(runId);');
  });

  it('keeps the passed-on note away from a run that relayed', () => {
    expect(chat).toContain('!runAnswerSent.has(runId) && !runRelaySent.has(runId)');
  });
});
