import { readFileSync } from 'fs';
import { join } from 'path';
import { asksLeaveToSend } from '../introInstruction';

/**
 * 0266 part 1 (the tester's 58043, run 51403): „სთხოვე ზურაბ მელაძეს,
 * დამაკავშიროს თამარ ხუციშვილთან." was answered „ზურაბ მელაძე თამარ ხუციშვილს
 * იცნობს. მივწერო ზურაბს და სთხოვო, დაგაკავშიროთ?" — nothing went, and the
 * owner never heard that Zurab had not opened the app. A question asking leave
 * to send no longer excuses the run from the unsent-instruction guard.
 */
describe('a question asking leave to send is not a real question (0266)', () => {
  it.each([
    'ზურაბ მელაძე თამარ ხუციშვილს იცნობს. მივწერო ზურაბს და სთხოვო, დაგაკავშიროთ?',
    'გავუგზავნო თხოვნა ლევანს?',
    'Levan knows her. Shall I ask him to introduce you?',
    'Do you want me to send him the request?',
  ])('„%s" asks leave', (reply) => {
    expect(asksLeaveToSend(reply)).toBe(true);
  });

  it.each([
    'რისთვის გჭირდება თამართან დაკავშირება? ერთი მოკლე მიზეზი დამიწერე.',
    'Why would you like to meet her?',
    'რომელ ნინოზეა საუბარი?',
  ])('„%s" is a real question (the reason, or which one)', (reply) => {
    expect(asksLeaveToSend(reply)).toBe(false);
  });

  it('reads only the last question', () => {
    expect(asksLeaveToSend('მივწერო ზურაბს? რისთვის გჭირდება?')).toBe(false);
  });

  it('keeps the guard on when the run only asked leave', () => {
    const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
    expect(chat).toMatch(
      /ownerAsksForIntroduction\(\[runOwnerLine\.get\(runId\) \?\? ''\]\) &&\s+endsWithQuestion\(finalText\) &&\s+!asksLeaveToSend\(finalText\);/,
    );
  });
});
