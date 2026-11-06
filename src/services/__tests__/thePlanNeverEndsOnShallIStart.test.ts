import {
  PLAN_ENDING_RULE,
  PLAN_FROM_FINDINGS_EVENT,
  PLAN_PROPOSAL_EVENT,
} from '../taskEngine.events';
import {
  farFindUnplannedNudge,
  PROMISED_ACTION_NO_GOAL_NUDGE,
  PROMISED_ACTION_NUDGE,
} from '../replyGuards';
import { createTaskFollowUp } from '../chat.service';

/**
 * The tester's prompt check (5 Nov, C1): probe 80785 ended „დავიწყო ასე?", the
 * ending the prompt forbids, because the server's own notes told the run to
 * „end by asking whether to start". Every note that leads to a plan now carries
 * the one rule: the closing question names the first person and what is asked.
 */
const LANGUAGES = ['ka', 'en', 'ru', 'es'] as const;
const WHETHER_TO_START = /დავიწყოთ თუ არა|whether to start|начинать ли|si empezamos/u;

describe('the plan’s closing question', () => {
  it('is the same rule in every plan event and language', () => {
    for (const event of [PLAN_PROPOSAL_EVENT, PLAN_FROM_FINDINGS_EVENT]) {
      for (const language of LANGUAGES) {
        expect(event[language]).toContain(PLAN_ENDING_RULE[language]);
        expect(event[language]).not.toMatch(WHETHER_TO_START);
      }
    }
  });

  it('is the rule in the notes that send the run to propose a plan', () => {
    const notes = [
      PROMISED_ACTION_NUDGE,
      PROMISED_ACTION_NO_GOAL_NUDGE,
      farFindUnplannedNudge(['საცდელი ადამიანი']),
    ];
    for (const note of notes) {
      expect(note).toContain(PLAN_ENDING_RULE.ka);
      expect(note).not.toMatch(WHETHER_TO_START);
    }
  });

  it('is the rule in the create_task result', () => {
    const { next } = createTaskFollowUp(undefined) as { next: string };
    expect(next).toContain(PLAN_ENDING_RULE.en);
    expect(next).not.toMatch(/end with one question in words/u);
  });

  it('names the forbidden ending, so the model knows it', () => {
    expect(PLAN_ENDING_RULE.ka).toContain('არასდროს „დავიწყო?“');
  });
});
