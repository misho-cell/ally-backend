import { readFileSync } from 'fs';
import { join } from 'path';
import { MEMBERS_SKIPPED_NUDGE, membersInTheBookNudge } from '../replyGuards';

/**
 * The tester's 1153 (38681): a corrected answer's first sentence stood on
 * screen as a step bubble at 01:02:13, and the reply that replaced it came at
 * 01:02:26 — „said twice". Before a guard's corrected turn, the streamed answer
 * is cleared, not moved into the steps.
 */
describe('a guard’s corrected turn', () => {
  const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
  const nudgeAt = chat.indexOf("const nudgeTurn = { role: 'user' as const, content: guardNudge };");

  it('clears the streamed answer without emitting it as a step', () => {
    const after = chat.slice(nudgeAt, chat.indexOf('let continuation', nudgeAt));
    expect(after).toContain('resetTurnStream(false);');
    expect(after).not.toContain('resetTurnStream();');
  });
});

/** The tester's 1160 (39042): a repeated-goal run's answer beside refused searches. */
describe('a run that repeats an open goal', () => {
  const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');

  it('drafts its narration like an answer round, so the answer is kept once', () => {
    const sites =
      chat.split('if (isAnswerRound(roundTools) || runRepeatedGoal.has(runId))').length - 1;
    expect(sites).toBe(2);
  });
});

/** The tester's 1162 (39074): the members note was read as the owner's reply. */
describe('a members note', () => {
  it('says the owner has not answered and asks for the owner’s language', () => {
    for (const note of [MEMBERS_SKIPPED_NUDGE, membersInTheBookNudge(['ნინო'])]) {
      expect(note).toContain('მფლობელს ჯერ არაფერი უპასუხია');
      expect(note).toContain('დაწერე მფლობელის ენაზე');
      expect(note.endsWith(')')).toBe(true);
    }
  });
});
