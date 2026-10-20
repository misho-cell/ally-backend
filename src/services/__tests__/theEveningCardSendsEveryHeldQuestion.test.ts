import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * #1687 (the tester's 65209): at 19:00 only one held question per member went
 * out; the rest were refused as duplicate_ask_in_flight by the cross-goal check.
 */
describe('the evening card’s held questions', () => {
  const asks = readFileSync(join(__dirname, '..', 'taskAsks.service.ts'), 'utf8');
  const cron = readFileSync(join(__dirname, '..', 'eveningCard.cron.ts'), 'utf8');

  it('are not taken for one question sent twice across goals', () => {
    expect(asks).toMatch(
      /\(card === undefined &&\s+\(await askedOnAnotherGoalJustNow\(fromUserId, toUserId, taskId, threadId\)\)\)/,
    );
  });

  it('are sent by the card, so the card is what the check sees', () => {
    expect(cron).toContain('{ eveningCardId: card.id }');
  });

  it('still meet the same-goal duplicate check', () => {
    expect(asks).toContain('previous.from_user_id === fromUserId &&');
  });
});
