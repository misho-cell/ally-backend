import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * 2581 (MTR #7, convs 46443, 46444, 46592): after „მოგვარდა." the close-or-keep
 * card sat above the run's own reply, and a typed „შეაჩერე დანარჩენი." cancelled
 * nothing. The card now comes after the reply.
 * #8779 b (rule 37, the founder 4 Nov 19:07): a typed answer is the model's
 * reading — answer_open_asks_card — never a word match.
 */
describe('the open-questions card after „solved" (2581)', () => {
  const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
  const src = readFileSync(join(__dirname, '..', 'openAsksAfterSolved.ts'), 'utf8');

  it('finish_task notes the card, and it is written after the reply is stored', () => {
    expect(chat).toContain('await noteOpenAsksCard(runId, taskId, threadId, Number(userId))');
    const delivered = chat.indexOf(
      'await deliverPendingMessages(userId, threadId, runId, language, toDeliver);',
    );
    expect(chat.indexOf('await offerNotedOpenAsksCard(runId);', delivered)).toBeGreaterThan(
      delivered,
    );
  });

  it('a tap is read by its exact button; typed words go to the model', () => {
    expect(src).toContain('const tap = openAsksTapOf(message);');
    expect(src).not.toContain('TYPED_CLOSE_RE');
  });

  it('the model’s answer settles the card once, the same way a tap does', () => {
    expect(chat).toContain("name: 'answer_open_asks_card',");
    expect(chat).toContain('const line = await settleOpenAsks(userId, threadId, tap);');
    expect(src).toContain('if (!(await claimTheCard(goal.id, tap))) return alreadySettled(null);');
  });
});
