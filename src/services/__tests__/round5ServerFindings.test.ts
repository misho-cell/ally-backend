import { readFileSync } from 'fs';
import { join } from 'path';
import { claimsToHavePassedItOn, PASSED_ON_NUDGE } from '../replyGuards';

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
    expect(chat).toContain('const choices = planButtonsWhenMissing(runId, loopChoices);');
    const assembled = chat.indexOf(
      'effectiveFinal = withPlanInReply(runId, effectiveFinal, choices);',
    );
    expect(
      chat.indexOf('const choices = planButtonsWhenMissing(runId, loopChoices);'),
    ).toBeLessThan(assembled);
  });

  it('adds approve and change only when the reply has none, or has the closing question as one', () => {
    const fn = chat.slice(chat.indexOf('export function planButtonsWhenMissing('));
    const body = fn.slice(0, fn.indexOf('\n}\n'));
    expect(body).toContain(
      'if (!runPlanForReply.has(runId) || replyAsksForApproval(offered)) return offered;',
    );
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
  });

  it('asks once more with the tool named, and never relays the line itself', () => {
    expect(guards.PASSED_ON_NUDGE).toContain('send_answer_to_asker');
    expect(guards.PASSED_ON_NUDGE).toContain('confirmed=true');
    expect(chat).toContain("runModes.get(runId) === 'incoming_ask' &&");
    expect(chat).toContain('!runAnswerSent.has(runId) &&');
    expect(chat).toContain("const nudgeTurn = { role: 'user' as const, content: guardNudge };");
  });

  it('keeps the nudge out of the owner’s history like the others', () => {
    const set = chat.slice(chat.indexOf('export const MODEL_ONLY_NUDGES'));
    expect(set.slice(0, 200)).toContain('PASSED_ON_NUDGE');
  });
});
